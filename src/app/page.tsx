import { ClubApp } from "@/components/club-app";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <ClubApp setupRequested={query.setup === "1"} authError={Boolean(query.auth_error)} />;
}
