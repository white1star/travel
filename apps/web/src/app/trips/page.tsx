import { SiteHeader } from "@/components/site-header";
import { TripsLibrary } from "@/components/trips/trips-library";

export default function TripsPage() {
  return (
    <>
      <SiteHeader active="trips" />
      <TripsLibrary />
    </>
  );
}
