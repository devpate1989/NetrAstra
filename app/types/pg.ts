export interface PgSummary {
  policeStation: string;
  totalApplications: number;
  disposed: number;
  pending: number;
  pendingAbove10Days: number;
  scrapedAt: string;
}

export interface PgComplaint {
  id: string;
  complaintNo: string;
  applicantName: string | null;
  mobile: string | null;
  complaintCategory: string | null;
  complaintDetails: string | null;
  status: string | null;
  assignedIo: string | null;
  dateOfComplaint: string | null;
  scrapedAt: string;
}
