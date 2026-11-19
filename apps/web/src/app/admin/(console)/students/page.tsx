import type { Metadata } from "next";
import { StudentsView } from "./StudentsView";
import "./students.css";

export const metadata: Metadata = { title: "Students" };

// 30f Students (docs/reference/admin-students.html): GET /admin/students/summary and /admin/students.
export default function StudentsPage() {
  return <StudentsView />;
}
