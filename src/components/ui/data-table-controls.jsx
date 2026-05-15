import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function DataTableToolbar({ searchValue, onSearchChange, searchPlaceholder = "Search...", children }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
      <div className="relative min-w-[240px] flex-1">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
        />
      </div>
      {children}
    </div>
  );
}

export function DataTablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
}) {
  const safeTotal = Math.max(0, total || 0);
  const totalPages = Math.max(1, Math.ceil(safeTotal / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = safeTotal === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = safeTotal === 0 ? 0 : Math.min(currentPage * pageSize, safeTotal);

  return (
    <div className="flex flex-col gap-2 border-t bg-background/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Rows per page</span>
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger className="h-8 w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{start}-{end} of {safeTotal}</span>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>
            Prev
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

