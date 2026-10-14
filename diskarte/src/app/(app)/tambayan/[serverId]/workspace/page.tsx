import type { Metadata } from "next";
import { SharedWorkspaceView } from "@/components/workspace/SharedWorkspaceView";
export const metadata: Metadata = { title: "Shared workspace" };
export default function WorkspacePage() { return <SharedWorkspaceView />; }
