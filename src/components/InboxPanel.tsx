import { useQuery } from "@tanstack/react-query";
import { fetchAwaitingReview, fetchMyPRs } from "../lib/github";

interface Props {
  token: string;
  owner: string;
  repo: string;
  viewerLogin: string;
  intervalMs: number;
}

export function InboxPanel({ token, owner, repo, viewerLogin, intervalMs }: Props) {
  const awaitingQuery = useQuery({
    queryKey: ["awaitingReview", owner, repo, viewerLogin],
    queryFn: () => fetchAwaitingReview(token, owner, repo, viewerLogin),
    refetchInterval: intervalMs,
    enabled: Boolean(token && owner && repo && viewerLogin),
  });

  const myPrsQuery = useQuery({
    queryKey: ["myPrs", owner, repo],
    queryFn: () => fetchMyPRs(token, owner, repo),
    refetchInterval: intervalMs,
    enabled: Boolean(token && owner && repo),
  });

  const awaiting = awaitingQuery.data ?? [];
  const myPrs = myPrsQuery.data?.prs ?? [];

  const unresolvedThreadsList = myPrs.flatMap((pr) =>
    pr.unresolvedThreads.map((thread) => ({
      pr,
      thread,
    }))
  );

  const isLoading = awaitingQuery.isFetching || myPrsQuery.isFetching;

  if (isLoading && !awaitingQuery.data && !myPrsQuery.data) {
    return <div className="empty">Loading inbox...</div>;
  }

  if (awaitingQuery.error || myPrsQuery.error) {
    return <div className="error">Inbox unavailable — check settings or retry</div>;
  }

  const isInboxEmpty = awaiting.length === 0 && unresolvedThreadsList.length === 0;

  return (
    <>
      <div className="section-head">
        <div className="section-title">YOUR ACTIONABLE INBOX</div>
        <div className="section-meta">
          {awaiting.length} REVIEWS · {unresolvedThreadsList.length} THREADS
        </div>
      </div>

      {isInboxEmpty ? (
        <div className="empty">You are all caught up! No pending actions.</div>
      ) : (
        <div className="inbox-layout">
          {/* NEEDS YOUR REVIEW */}
          {awaiting.length > 0 && (
            <div className="inbox-section">
              <h3 className="inbox-section-title">NEEDS YOUR REVIEW</h3>
              <ul className="pr-list">
                {awaiting.map((pr) => (
                  <li key={pr.number} className="row inbox-row">
                    <a
                      className="pr-num-cell mono"
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {pr.number}
                    </a>
                    <span className="item-title">{pr.title}</span>
                    <span className="inbox-meta">
                      {pr.blockingDays !== null && pr.blockingDays > 0 ? (
                        <span className="badge badge-warning">Blocked {pr.blockingDays}d</span>
                      ) : (
                        <span className="badge badge-info">Requested</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* UNADDRESSED FEEDBACK */}
          {unresolvedThreadsList.length > 0 && (
            <div className="inbox-section">
              <h3 className="inbox-section-title">UNADDRESSED FEEDBACK ON YOUR PRs</h3>
              <ul className="pr-list threads-list">
                {unresolvedThreadsList.map(({ pr, thread }, i) => {
                  const lastComment = thread.comments[thread.comments.length - 1];
                  return (
                    <li key={`${pr.number}-${i}`} className="row thread-row">
                      <div className="thread-content">
                        <div className="thread-header">
                          <a href={pr.url} target="_blank" rel="noopener noreferrer" className="pr-num-cell mono">
                            {pr.number}
                          </a>
                          <span className="thread-path mono">{thread.path}</span>
                        </div>
                        <div className="thread-body">
                          <span className="thread-author">{lastComment.authorLogin ?? "Unknown"}:</span>
                          <span className="thread-text">{lastComment.body}</span>
                        </div>
                      </div>
                      <a href={lastComment.url} target="_blank" rel="noopener noreferrer" className="btn btn-small">
                        View
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
