import { redirect } from "next/navigation";

/** Trips live under Looks; this keeps `/trips` a working address. */
export default function TripsPage() {
  redirect("/looks?tab=trips");
}
