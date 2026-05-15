import { Link } from "react-router-dom";
import { Clock, Brain } from "lucide-react";
import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTablePagination, DataTableToolbar } from "@/components/ui/data-table-controls";
import { useTableState } from "@/hooks/useTableState";

export default function RecentSessions({ sessions }) {
  const table = useTableState({
    initialFilters: { course: "all" },
    initialPageSize: 10,
  });

  const courseOptions = useMemo(() => {
    const map = new Map();
    sessions.forEach((session) => {
      if (session.course_id && session.course_title) {
        map.set(session.course_id, session.course_title);
      }
    });
    return [...map.entries()].map(([id, title]) => ({ id, title }));
  }, [sessions]);

  const filtered = useMemo(() => {
    const q = table.search.trim().toLowerCase();
    return sessions.filter((session) => {
      if (table.filters.course !== "all" && session.course_id !== table.filters.course) return false;
      if (!q) return true;
      return [
        session.topic_title || "",
        session.course_title || "",
        session.status || "",
      ].join(" ").toLowerCase().includes(q);
    });
  }, [sessions, table.search, table.filters.course]);
  const pagination = table.paginate(filtered);

  if (sessions.length === 0) {
    return (
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recent Study Sessions</h2>
        <div className="bg-card border rounded-lg p-6 text-center">
          <Brain className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No study sessions yet. Start your first session!</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent Sessions</h2>
        <Link to="/progress" className="text-xs text-primary hover:underline">View all</Link>
      </div>
      <div className="bg-card border rounded-lg overflow-hidden flex flex-col">
        <div className="p-3 border-b">
          <DataTableToolbar
            searchValue={table.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Search sessions..."
          >
            <Select value={table.filters.course} onValueChange={(value) => table.setFilter("course", value)}>
              <SelectTrigger className="w-full md:w-56"><SelectValue placeholder="Course" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All courses</SelectItem>
                {courseOptions.map((course) => (
                  <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DataTableToolbar>
        </div>
        <div className="max-h-[42vh] overflow-auto">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No sessions match current filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Topic</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.rows.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="font-medium">{session.topic_title || "Study session"}</TableCell>
                    <TableCell>{session.course_title || "No course"}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        {session.duration_minutes || 0}m
                      </span>
                    </TableCell>
                    <TableCell>
                      {session.created_date ? (
                        <div className="text-sm">
                          <p>{new Date(session.created_date).toLocaleDateString()}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(session.created_date), { addSuffix: true })}
                          </p>
                        </div>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <DataTablePagination
          page={pagination.safePage}
          pageSize={table.pageSize}
          total={filtered.length}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
        />
      </div>
    </section>
  );
}
