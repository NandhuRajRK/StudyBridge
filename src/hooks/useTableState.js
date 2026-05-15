import { useMemo, useState } from "react";

export function useTableState({
  initialSearch = "",
  initialFilters = {},
  initialPage = 1,
  initialPageSize = 10,
} = {}) {
  const [search, setSearchRaw] = useState(initialSearch);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSizeRaw] = useState(initialPageSize);

  const setSearch = (value) => {
    setSearchRaw(value);
    setPage(1);
  };

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const setPageSize = (value) => {
    setPageSizeRaw(value);
    setPage(1);
  };

  const paginate = (rows) => {
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
    return { rows: pageRows, total, totalPages, safePage };
  };

  return useMemo(() => ({
    search,
    filters,
    page,
    pageSize,
    setSearch,
    setFilter,
    setPage,
    setPageSize,
    paginate,
  }), [search, filters, page, pageSize]);
}

