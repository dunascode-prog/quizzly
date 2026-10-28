import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { PageHead } from "@/components/admin/ui";
import { reports, summary } from "./data";
import { ReportsQueue } from "./ReportsQueue";
import "./reports.css";

export const metadata: Metadata = { title: "Reports" };

// 30c Reports queue (docs/reference/admin-reports.html). Data: reports, questions and attempt_answers, once the admin API exists.
export default function ReportsPage() {
  return (
    <>
      <PageHead
        eyebrow={`${summary.open} open · ${summary.hidden} auto-hidden · oldest ${summary.oldest}`}
        title="Reports "
        highlight="queue"
        action={
          // TODO(E4): CSV export (no names or emails).
          <button type="button" className="a-btn">
            <Icon name="download" size={16} />
            Export CSV
          </button>
        }
      />
      <ReportsQueue reports={reports} />
    </>
  );
}
