import * as XLSX from 'xlsx';

export interface ReportRow {
  jiraId: string;
  issue: string;
  hours: number;
}

export function exportXlsx(rows: ReportRow[], year: number, monthNum: string, monthSlug: string, username: string, periodStart: string, periodEnd: string) {
  const data = [
    ['Jira ID', 'Issue', 'Hours Spent'],
    ...rows.map(r => [r.jiraId, r.issue, r.hours]),
    ['', 'Total', rows.reduce((s, r) => s + r.hours, 0)],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'PKUP');

  const fileName = `${username}.${year}.${monthNum}.${monthSlug}.from.${periodStart}.to.${periodEnd}.PKUP.report.xlsx`;
  XLSX.writeFile(wb, fileName);
}
