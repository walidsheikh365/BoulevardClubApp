export async function allRows<T>(
  getPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 500
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await getPage(from, from + pageSize - 1);
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error("The club data service returned an empty response. Please refresh.");
    rows.push(...result.data);
    if (result.data.length < pageSize) return rows;
  }
}
