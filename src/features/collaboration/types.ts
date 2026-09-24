export const collaborationRoles = ["admin", "editor", "commenter", "reader"] as const;
export type CollaborationRole = (typeof collaborationRoles)[number];

export const collaborationResourceTypes = [
  "material",
  "note",
  "flashcards",
  "quiz",
  "workspace",
  "study-plan",
] as const;
export type CollaborationResourceType = (typeof collaborationResourceTypes)[number];

export type StudyRoom = {
  id: string;
  name: string;
  description: string;
  kind: "study" | "classroom";
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type RoomMember = {
  roomId: string;
  userId: string;
  name: string;
  email: string;
  role: CollaborationRole;
  joinedAt: string;
};

export type RoomInvite = {
  id: string;
  roomId: string;
  token: string;
  role: Exclude<CollaborationRole, "admin">;
  createdBy: string;
  expiresAt?: string;
  maxUses: number;
  uses: number;
  createdAt: string;
};

export type CollaborativeResource = {
  id: string;
  roomId: string;
  type: CollaborationResourceType;
  recordId?: string;
  title: string;
  data: unknown;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type CollaborationComment = {
  id: string;
  roomId: string;
  targetType: CollaborationResourceType | "chapter" | "concept";
  targetId: string;
  parentId?: string;
  anchor?: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

export type RoomPresence = {
  roomId: string;
  userId: string;
  name: string;
  status: "studying" | "typing" | "away";
  resourceId?: string;
  lastSeenAt: string;
};

export type CollaborationActivity = {
  id: string;
  roomId: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, unknown>;
  createdAt: string;
};

export type CollaborationProgress = {
  roomId: string;
  resourceId: string;
  userId: string;
  mode: "individual" | "group" | "teacher";
  completed: number;
  total: number;
  score?: number;
  updatedAt: string;
};

export type StudyRoomSnapshot = {
  room: StudyRoom;
  currentRole: CollaborationRole;
  members: RoomMember[];
  resources: CollaborativeResource[];
  comments: CollaborationComment[];
  presence: RoomPresence[];
  activity: CollaborationActivity[];
  progress: CollaborationProgress[];
};
