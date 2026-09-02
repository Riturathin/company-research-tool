import json

from sqlalchemy import desc
from sqlalchemy.orm import Session

from .models import Report
from .schemas import ReportData, ReportDetail, ReportSummary, SectionName


def create_report(db: Session, company_name: str, data: ReportData) -> ReportDetail:
    report = Report(company_name=company_name, data_json=data.model_dump_json())
    db.add(report)
    db.commit()
    db.refresh(report)
    return to_detail(report)


def update_report_data(db: Session, report_id: int, data: ReportData) -> ReportDetail | None:
    report = db.get(Report, report_id)
    if report is None:
        return None
    report.data_json = data.model_dump_json()
    db.commit()
    db.refresh(report)
    return to_detail(report)


def list_reports(db: Session) -> list[ReportSummary]:
    reports = db.query(Report).order_by(desc(Report.created_at)).all()
    return [ReportSummary(id=r.id, company_name=r.company_name, created_at=r.created_at) for r in reports]


def get_report(db: Session, report_id: int) -> ReportDetail | None:
    report = db.get(Report, report_id)
    return to_detail(report) if report else None


def delete_report(db: Session, report_id: int) -> bool:
    report = db.get(Report, report_id)
    if report is None:
        return False
    db.delete(report)
    db.commit()
    return True


def update_report_section(db: Session, report_id: int, section: SectionName, section_data: object) -> ReportDetail | None:
    report = db.get(Report, report_id)
    if report is None:
        return None
    data = ReportData.model_validate(json.loads(report.data_json))
    setattr(data, section, section_data)
    data.section_errors.pop(section, None)
    report.data_json = data.model_dump_json()
    db.commit()
    db.refresh(report)
    return to_detail(report)


def to_detail(report: Report) -> ReportDetail:
    return ReportDetail(
        id=report.id,
        company_name=report.company_name,
        created_at=report.created_at,
        data=ReportData.model_validate(json.loads(report.data_json)),
    )
