import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { CardHead, PageHead, Tiles } from "@/components/admin/ui";
import { activeThisMonth, schools, sources, students, tiles } from "./data";
import { StudentsTable } from "./StudentsTable";
import "./students.css";

export const metadata: Metadata = { title: "Students" };

// 30f Students (docs/reference/admin-students.html). Data: profiles, usage_counters and referrals, once the admin API exists.
export default function StudentsPage() {
  return (
    <>
      <PageHead
        eyebrow={`${activeThisMonth} active this month`}
        title="Stu"
        highlight="dents"
        action={
          // TODO(E4): CSV export without names or emails.
          <button type="button" className="a-btn">
            <Icon name="download" size={16} />
            Export CSV
          </button>
        }
      />
      <Tiles tiles={tiles} />

      <div className="st-grid">
        <section className="a-card" aria-labelledby="st-schools">
          <CardHead title="Schools" />
          <table className="a-table" id="st-schools">
            <thead>
              <tr>
                <th>School</th>
                <th className="a-r">Students</th>
                <th className="a-r">Share</th>
              </tr>
            </thead>
            <tbody>
              {schools.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td className="a-r">{s.students}</td>
                  <td className="a-r">{s.share}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="a-card" aria-labelledby="st-sources">
          <CardHead title="Where new students come from" />
          <table className="a-table" id="st-sources">
            <thead>
              <tr>
                <th>Source</th>
                <th className="a-r">This week</th>
                <th className="a-r">Share</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td className="a-r">{s.week}</td>
                  <td className="a-r">{s.share}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <StudentsTable students={students} />

      <p className="st-privacy">
        <Icon name="info" size={16} />
        <span>
          Admins see display names, school, usage and flags only. Notes, chats, answers and progress are never shown here. Opening a student is
          logged.
        </span>
      </p>
    </>
  );
}
