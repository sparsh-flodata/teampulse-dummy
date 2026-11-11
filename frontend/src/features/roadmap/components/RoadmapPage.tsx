import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, UserRound, Users } from "lucide-react";
import { TabPanel } from "@/components/ui/TabPanel";
import { FormError } from "@/components/ui";
import { roadmapQuery, teamRoadmapsQuery } from "../api";
import { RoadmapView } from "./RoadmapView";
import { TeamRoadmaps } from "./TeamRoadmaps";

export type RoadmapTab = "yours" | "team";

/**
 * Your roadmap, and for anyone with people below them, a Team's tab listing each
 * person's roadmap. Opening someone shows theirs. The server allows only the
 * person and their seniors to see a roadmap.
 */
export function RoadmapPage({
  tab = "yours",
  person,
  onSearch,
}: {
  tab?: RoadmapTab;
  person?: number;
  onSearch: (patch: { tab?: RoadmapTab; person?: number }) => void;
}) {
  const team = useQuery(teamRoadmapsQuery);
  const mine = useQuery({ ...roadmapQuery("me"), enabled: !person });
  const theirs = useQuery({ ...roadmapQuery(person ?? 0), enabled: !!person });
  const hasTeam = (team.data?.length ?? 0) > 0;

  if (person)
    return (
      <div className="rm-page">
        <button
          className="text-button rm-back"
          onClick={() => onSearch({ person: undefined, tab: "team" })}
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Back to the team
        </button>
        {theirs.error && <FormError message={theirs.error.message} />}
        {theirs.data && (
          <TabPanel tabKey={"person-" + person}>
            <RoadmapView roadmap={theirs.data} />
          </TabPanel>
        )}
      </div>
    );

  const active: RoadmapTab = hasTeam ? tab : "yours";
  return (
    <div className="rm-page">
      {hasTeam && (
        <div
          className="context-tabs rm-tabs"
          role="tablist"
          aria-label="Roadmaps"
        >
          <button
            role="tab"
            aria-selected={active === "yours"}
            className={active === "yours" ? "active" : ""}
            onClick={() => onSearch({ tab: undefined })}
          >
            <UserRound size={15} aria-hidden="true" />
            Yours
          </button>
          <button
            role="tab"
            aria-selected={active === "team"}
            className={active === "team" ? "active" : ""}
            onClick={() => onSearch({ tab: "team" })}
          >
            <Users size={15} aria-hidden="true" />
            Team&rsquo;s
            <small>{team.data?.length}</small>
          </button>
        </div>
      )}
      {(mine.error || team.error) && (
        <FormError message={(mine.error ?? team.error)!.message} />
      )}
      <TabPanel tabKey={active}>
        {active === "team"
          ? team.data && (
              <TeamRoadmaps
                rows={team.data}
                onOpen={(id) => onSearch({ person: id })}
              />
            )
          : mine.data && <RoadmapView roadmap={mine.data} />}
      </TabPanel>
    </div>
  );
}
