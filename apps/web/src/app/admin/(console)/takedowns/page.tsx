import type { Metadata } from "next";
import { CardHead, PageHead } from "@/components/admin/ui";
import { log, nearUnshare, unshareAt } from "./data";
import { Takedowns } from "./Takedowns";
import "./takedowns.css";

export const metadata: Metadata = { title: "Takedowns" };

// 30d Takedowns (docs/reference/admin-takedowns.html). Data: FR-MOD-04/05 takedown log and course_shares, once the admin API exists.
export default function TakedownsPage() {
  const active = log.filter((t) => t.active).length;
  return (
    <>
      <PageHead eyebrow={`${active} active · copyright and abuse removals`} title="Take" highlight="downs" />
      <Takedowns log={log} today="26 Oct" />

      <section className="a-card" aria-labelledby="td-near">
        <CardHead
          title="Shared courses close to auto-unshare"
          sub={`Unshared automatically at ${unshareAt} reports from different members (FR-MOD-05)`}
        />
        <div className="a-table-wrap">
          <table className="a-table" id="td-near">
            <thead>
              <tr>
                <th>Course</th>
                <th>Owner</th>
                <th className="a-r">Members</th>
                <th className="a-c">Reports</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {nearUnshare.map((c) => (
                <tr key={c.course}>
                  <td>{c.course}</td>
                  <td>{c.owner}</td>
                  <td className="a-r">{c.members}</td>
                  <td className="a-c a-nw">
                    {c.reports >= unshareAt - 1 ? (
                      <b>
                        {c.reports} / {unshareAt}
                      </b>
                    ) : (
                      `${c.reports} / ${unshareAt}`
                    )}
                  </td>
                  <td className="a-r">
                    {/* TODO(E4): open the course's member reports. */}
                    <button type="button" className="a-btn" aria-label={`Review ${c.course}`}>
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
