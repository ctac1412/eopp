from datetime import UTC, datetime

from src.entities import CompanyAlias, CompanyBillingSetting, get_session

TAX_COMMISSION_MODES = {"added", "included"}


def normalize_tax_commission_mode(mode: str | None) -> str:
    return mode if mode in TAX_COMMISSION_MODES else "added"


def list_company_billing_settings() -> list[CompanyBillingSetting]:
    with get_session() as session:
        return session.query(CompanyBillingSetting).order_by(CompanyBillingSetting.company).all()


def get_company_billing_settings(company: str) -> CompanyBillingSetting:
    with get_session() as session:
        setting = session.get(CompanyBillingSetting, company)
        if setting:
            setting.tax_commission_mode = normalize_tax_commission_mode(
                getattr(setting, "tax_commission_mode", None)
            )
            return setting
        return CompanyBillingSetting(
            company=company,
            auto_invoice_reopen=False,
            tax_commission_mode="added",
            updated_at=None,
        )


def upsert_company_billing_settings(
    company: str, auto_invoice_reopen: bool, tax_commission_mode: str | None = None
) -> CompanyBillingSetting:
    now = datetime.now(UTC).isoformat()
    mode = normalize_tax_commission_mode(tax_commission_mode)
    with get_session() as session:
        setting = session.get(CompanyBillingSetting, company)
        if setting:
            setting.auto_invoice_reopen = auto_invoice_reopen
            setting.tax_commission_mode = mode
            setting.updated_at = now
        else:
            setting = CompanyBillingSetting(
                company=company,
                auto_invoice_reopen=auto_invoice_reopen,
                tax_commission_mode=mode,
                updated_at=now,
            )
            session.add(setting)
        session.commit()
        session.refresh(setting)
        return setting


def list_company_aliases() -> list[CompanyAlias]:
    with get_session() as session:
        return session.query(CompanyAlias).order_by(CompanyAlias.company, CompanyAlias.alias).all()


def upsert_company_alias(alias: str, company: str) -> CompanyAlias:
    now = datetime.now(UTC).isoformat()
    clean_alias = " ".join(alias.split())
    clean_company = " ".join(company.split())
    with get_session() as session:
        existing = session.get(CompanyAlias, clean_alias)
        if existing:
            existing.company = clean_company
            existing.updated_at = now
        else:
            existing = CompanyAlias(
                alias=clean_alias, company=clean_company, created_at=now, updated_at=now
            )
            session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing


def delete_company_alias(alias: str) -> bool:
    with get_session() as session:
        existing = session.get(CompanyAlias, alias)
        if not existing:
            return False
        session.delete(existing)
        session.commit()
        return True
