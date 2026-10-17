import Link from "next/link";
import { ArrowUpRight, Columns3 } from "lucide-react";

export function WorkspaceCloseup() {
  return (
    <div className="workspace-closeup">
      <div className="closeup-title">
        <Columns3 className="size-4" aria-hidden /> A workspace that makes room.
      </div>
      <div className="closeup-columns">
        <div>
          <span className="section-kicker">TOGETHER</span>
          <h3>
            Ideas become
            <br />
            something real.
          </h3>
          <p>
            Shared notes, task boards, resources, whiteboards and focus
            sessions. Connected to the same channels as your conversations.
          </p>
          <Link
            href="/signup"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-sun"
          >
            Create your space <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        </div>
        <ul>
          {[
            "Notes that stay with the conversation",
            "A task board for the next big idea",
            "Resources worth keeping",
            "A little space to focus",
          ].map((text, index) => (
            <li key={text}>
              <span>0{index + 1}</span>
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
