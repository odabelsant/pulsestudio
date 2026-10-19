import HomeClient from "@/components/workspace/HomeClient";
import { existingSectionByModule } from "@/components/workspace/modules";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const { section } = await searchParams;
  const requestedSection = Array.isArray(section) ? section[0] : section;
  const initialSection =
    Object.values(existingSectionByModule).find(
      (existingSection) => existingSection === requestedSection,
    ) ?? "chat";

  return <HomeClient initialSection={initialSection} />;
}
