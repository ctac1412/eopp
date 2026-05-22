const COMPANY_ALIASES = {
  'ООО "АРТ-ТРАНС"': "Хип-Хоп Транс Дэнс",
};

export const REPORT_PRESETS = [
  { id: "all", label: "Все" },
  { id: "success", label: "Успешные" },
  { id: "errors", label: "Ошибки" },
  { id: "billing", label: "К счету" },
];

export function getOpType(record) {
  if (record.op_type === "create") return "Создание";
  if (record.op_type === "reschedule") return "Перенос";
  return "—";
}

export function getFio(record) {
  const fio = record.fio;
  if (!fio || typeof fio !== "string") return "—";
  return fio.trim().split(/\s+/).map((part) => `${part[0]}.`).join(" ");
}

export function getFioFull(record) {
  return record.fio || "—";
}

export function getCompany(record) {
  const name = record.company;
  if (!name) return "—";
  return COMPANY_ALIASES[name] || name;
}

export function getCompanyFull(record) {
  return record.company || "—";
}

export function getVehicleNumber(record, short = true) {
  const number = record.vehicle_number;
  if (!number) return "—";
  return short && number.length > 4 ? `${number.slice(0, 4)}....` : number;
}

export function getVehicleNumberFull(record) {
  return record.vehicle_number || "—";
}

export function isTestRecord(record) {
  return record.is_test === true || record.is_test === 1;
}

export function isBillableRecord(record) {
  if (isTestRecord(record)) return false;
  const hasPrice = record.price != null && record.price > 0;
  const isPaid = record.paid === true;
  return record.status === "confirmed" && hasPrice && !isPaid && !record.invoice_id;
}

export function hasMissingPrice(record) {
  return !isTestRecord(record) && record.status === "confirmed" && !(record.price > 0);
}

export function getSearchText(record) {
  return [
    record.id,
    record.label,
    record.api_key_id,
    record.reservation_id,
    record.captcha_id,
    record.error_message,
    record.error_stage,
    record.company,
    record.fio,
    record.vehicle_number,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesPreset(record, preset) {
  if (preset === "success") return record.status === "confirmed";
  if (preset === "errors") return record.status === "failed";
  if (preset === "billing") return isBillableRecord(record);
  return true;
}

export function groupByCompany(records) {
  const groups = {};
  records.forEach((record) => {
    const company = getCompany(record);
    if (!groups[company]) {
      groups[company] = {
        reschedule: 0,
        create: 0,
        errors: 0,
        readyForInvoice: 0,
        invoiceAmount: 0,
        records: [],
      };
    }
    groups[company].records.push(record);
    if (record.op_type === "reschedule") groups[company].reschedule++;
    if (record.op_type === "create") groups[company].create++;
    if (record.status === "failed") groups[company].errors++;
    if (isBillableRecord(record)) {
      groups[company].readyForInvoice++;
      groups[company].invoiceAmount += record.price || 0;
    }
  });
  return Object.entries(groups).map(([name, counts]) => ({ name, ...counts }));
}

export function getReadyForInvoiceCount(companyRecords) {
  return companyRecords.filter(isBillableRecord).length;
}

export function getStatusLabel(status) {
  if (status === "confirmed") return "Успех";
  if (status === "failed") return "Ошибка";
  if (status === "pending") return "В работе";
  return status || "—";
}

export function getStatusClass(status) {
  if (status === "confirmed") return "bg-success";
  if (status === "failed") return "bg-danger";
  if (status === "pending") return "bg-warning text-dark";
  return "bg-secondary";
}
