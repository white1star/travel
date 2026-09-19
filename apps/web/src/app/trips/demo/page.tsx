import { SavedItinerary } from "@/components/itinerary/saved-itinerary";
import { SiteHeader } from "@/components/site-header";

export default function DemoTripPage() {
  return (
    <>
      <SiteHeader active="trips" />
      <SavedItinerary />
    </>
  );
}
