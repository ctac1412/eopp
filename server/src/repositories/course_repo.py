"""Course and course-captcha repository."""

from datetime import UTC, datetime

from src.entities import Course, CourseCaptcha, CaptchaFile, get_session


def create_course(name: str, captcha_file_ids: list[int], description: str = "", created_by: str = "", pause_between: bool = True) -> dict:
    with get_session() as session:
        course = Course(
            name=name,
            description=description,
            created_by=created_by,
            created_at=datetime.now(UTC).isoformat(),
            pause_between=pause_between,
        )
        session.add(course)
        session.flush()

        for idx, cf_id in enumerate(captcha_file_ids):
            cc = CourseCaptcha(
                course_id=course.id,
                captcha_file_id=cf_id,
                sort_order=idx,
            )
            session.add(cc)

        session.commit()
        return {"id": course.id, "name": course.name, "pause_between": course.pause_between, "captcha_count": len(captcha_file_ids)}


def list_courses() -> list[dict]:
    with get_session() as session:
        courses = session.query(Course).order_by(Course.created_at.desc()).all()
        result = []
        for c in courses:
            count = (
                session.query(CourseCaptcha)
                .filter(CourseCaptcha.course_id == c.id)
                .count()
            )
            result.append({
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "created_by": c.created_by,
                "created_at": c.created_at,
                "captcha_count": count,
                "pause_between": c.pause_between if c.pause_between is not None else True,
            })
        return result


def get_course(course_id: int) -> dict | None:
    with get_session() as session:
        course = session.get(Course, course_id)
        if not course:
            return None
        ccs = (
            session.query(CourseCaptcha, CaptchaFile)
            .join(CaptchaFile, CaptchaFile.id == CourseCaptcha.captcha_file_id)
            .filter(CourseCaptcha.course_id == course_id)
            .order_by(CourseCaptcha.sort_order)
            .all()
        )
        captchas = [
            {
                "course_captcha_id": cc.id,
                "captcha_file_id": cf.id,
                "captcha_id": cf.captcha_id,
                "file_path": cf.file_path,
                "captcha_type": int(cf.captcha_type) if cf.captcha_type is not None and cf.captcha_type.isdigit() else None,
                "valid_index": cf.valid_index,
                "variants_count": cf.variants_count,
                "sort_order": cc.sort_order,
            }
            for cc, cf in ccs
        ]
        return {
            "id": course.id,
            "name": course.name,
            "description": course.description,
            "created_by": course.created_by,
            "created_at": course.created_at,
            "pause_between": course.pause_between if course.pause_between is not None else True,
            "captchas": captchas,
        }


def delete_course(course_id: int) -> bool:
    with get_session() as session:
        course = session.get(Course, course_id)
        if not course:
            return False
        session.query(CourseCaptcha).filter(CourseCaptcha.course_id == course_id).delete()
        session.delete(course)
        session.commit()
        return True


def get_course_captcha_ids(course_id: int) -> list[int]:
    """Return ordered list of captcha_file_ids for the course."""
    with get_session() as session:
        ccs = (
            session.query(CourseCaptcha)
            .filter(CourseCaptcha.course_id == course_id)
            .order_by(CourseCaptcha.sort_order)
            .all()
        )
        return [cc.captcha_file_id for cc in ccs]
