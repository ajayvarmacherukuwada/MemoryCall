export type AppTab = "home" | "library" | "memory" | "search" | "profile";

export type MemoryItem = {
  id: string;
  title: string;
  participants: string;
  time: string;
  duration: string;
  summary: string;
  tag: string;
};

export type CollectionTone = "rose" | "cyan" | "emerald" | "violet" | "amber" | "indigo" | "neutral";

export type CollectionItem = {
  name: string;
  count: string;
  tone: CollectionTone;
};

export const continueMemory: MemoryItem = {
  id: "last-memory",
  title: "Sunday check-in with Mom",
  participants: "Mom, Maya",
  time: "Today · 8:14 PM",
  duration: "18 min",
  summary: "A quiet call about family updates, travel plans, and the property papers we do not want to lose track of.",
  tag: "Continue where you left off",
};

export const recentMemories: MemoryItem[] = [
  {
    id: "memory-1",
    title: "Project reset with Priya",
    participants: "Priya, Marcus",
    time: "Yesterday",
    duration: "32 min",
    summary: "Aligned on the new launch timeline and the one decision we need to revisit next week.",
    tag: "Business",
  },
  {
    id: "memory-2",
    title: "Doctor follow-up",
    participants: "Dr. Ellis",
    time: "Tue",
    duration: "11 min",
    summary: "Captured the medication change, next appointment, and the question to ask at the clinic.",
    tag: "Health",
  },
  {
    id: "memory-3",
    title: "Learning plan review",
    participants: "Avery",
    time: "Mon",
    duration: "24 min",
    summary: "Saved the reading list, course notes, and the one concept that finally clicked.",
    tag: "Learning",
  },
];

export const collections: CollectionItem[] = [
  { name: "Family", count: "18 memories", tone: "rose" },
  { name: "Business", count: "24 memories", tone: "cyan" },
  { name: "Health", count: "9 memories", tone: "emerald" },
  { name: "Learning", count: "14 memories", tone: "violet" },
  { name: "Property", count: "6 memories", tone: "amber" },
  { name: "Friends", count: "21 memories", tone: "indigo" },
  { name: "Custom", count: "Create your own", tone: "neutral" },
];

export const libraryHighlights = ["Pinned", "Shared", "Quiet notes", "Important", "Recently added"];

export const searchSuggestions = [
  "Mom travel plans",
  "Prescription update",
  "Property paperwork",
  "Launch timeline",
  "Course notes",
  "Dinner with friends",
];

export const searchResults: MemoryItem[] = [
  {
    id: "result-1",
    title: "Property walkthrough",
    participants: "Estate agent, Dad",
    time: "3 days ago",
    duration: "27 min",
    summary: "Saved the next step on the house visit plus the renovation questions to ask before making a decision.",
    tag: "Property",
  },
  {
    id: "result-2",
    title: "Weekly check-in",
    participants: "Team",
    time: "Last week",
    duration: "41 min",
    summary: "Captured the action items, key blockers, and the follow-up that matters most.",
    tag: "Business",
  },
  {
    id: "result-3",
    title: "Family holiday plans",
    participants: "Siblings",
    time: "2 weeks ago",
    duration: "19 min",
    summary: "Kept the dates, booking decisions, and the one detail everyone kept forgetting.",
    tag: "Family",
  },
];

