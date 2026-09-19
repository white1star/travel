import { PlannerWizard } from "@/components/planner/planner-wizard";
import { SiteHeader } from "@/components/site-header";

export default function NewPlanPage() {
  return (
    <>
      <SiteHeader active="plan" />
      <main id="main-content" className="planner-page"><PlannerWizard /></main>
    </>
  );
}
