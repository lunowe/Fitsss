import type { Metadata } from "next";
import { Archive, Plus, Sparkles, User } from "lucide-react";
import { InsetGroup, LargeTitleHeader, Row, RowIcon, Screen, SectionHeader } from "@/components/shell";
import { AppearanceControl } from "@/components/you/AppearanceControl";
import { requireUser } from "@/lib/session";
import { getTasteOverview } from "@/server/taste-queries";
import { SignOutRow } from "./sign-out-button";

export const metadata: Metadata = {
  title: "You",
};

const APP_VERSION = "0.1.0";

export default async function YouPage() {
  const [user, taste] = await Promise.all([requireUser(), getTasteOverview()]);

  // Every scope's list, added up: what the app currently believes about you.
  const learned = [taste.overall, ...Object.values(taste.byStyle)].reduce(
    (total, profile) => total + profile.lines.length + profile.avoid.length,
    0,
  );

  return (
    <Screen>
      <LargeTitleHeader title="You" />
      <div className="space-y-6 px-4 pt-2">
        <section>
          <SectionHeader>Account</SectionHeader>
          <InsetGroup>
            <Row
              leading={
                <RowIcon>
                  <User aria-hidden />
                </RowIcon>
              }
              title={user.name || "Signed in"}
              subtitle={user.email}
            />
          </InsetGroup>
        </section>

        <section>
          <SectionHeader>Appearance</SectionHeader>
          <InsetGroup>
            <div className="px-4 py-2.5">
              <AppearanceControl />
            </div>
          </InsetGroup>
        </section>

        <section>
          <SectionHeader>Taste</SectionHeader>
          <InsetGroup>
            <Row
              leading={
                <RowIcon>
                  <Sparkles aria-hidden />
                </RowIcon>
              }
              title="Taste notes"
              subtitle={
                learned === 0
                  ? "Nothing learned yet"
                  : `${learned} learned ${learned === 1 ? "line" : "lines"}`
              }
              href="/you/taste"
            />
          </InsetGroup>
        </section>

        <section>
          <SectionHeader>Closet</SectionHeader>
          <InsetGroup>
            <Row
              leading={
                <RowIcon>
                  <Archive aria-hidden />
                </RowIcon>
              }
              title="Archived pieces"
              href="/closet/archived"
            />
            <Row
              leading={
                <RowIcon>
                  <Plus aria-hidden />
                </RowIcon>
              }
              title="Add pieces"
              href="/closet/add"
            />
          </InsetGroup>
        </section>

        <section>
          <SectionHeader>About</SectionHeader>
          <InsetGroup>
            <Row title="Version" trailing={<span className="tabular-nums">{APP_VERSION}</span>} />
          </InsetGroup>
        </section>

        <SignOutRow />
      </div>
    </Screen>
  );
}
