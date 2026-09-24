import { AuthClient } from "@/features/account/AuthClient";
import type { CollaborationResourceType, CollaborationRole, CollaborativeResource, StudyRoom, StudyRoomSnapshot } from "./types";

const root = "/api/collaboration";
export const CollaborationClient = {
  list: () => AuthClient.request<{ rooms: StudyRoom[] }>(`${root}/rooms`),
  room: (roomId: string) => AuthClient.request<StudyRoomSnapshot>(`${root}/rooms/${encodeURIComponent(roomId)}`),
  create: (input: { name: string; description: string; kind: StudyRoom["kind"] }) => AuthClient.request<{ room: StudyRoom }>(`${root}/rooms`, { method: "POST", body: JSON.stringify(input) }),
  deleteRoom:(roomId:string)=>AuthClient.request(`${root}/rooms/${encodeURIComponent(roomId)}`,{method:"DELETE"}),
  leave:(roomId:string,userId:string)=>AuthClient.request(`${root}/rooms/${encodeURIComponent(roomId)}/members`,{method:"DELETE",body:JSON.stringify({userId})}),
  join: (token: string) => AuthClient.request<{ room: StudyRoom }>(`${root}/join`, { method: "POST", body: JSON.stringify({ token }) }),
  invite: (roomId: string, role: Exclude<CollaborationRole, "admin">) => AuthClient.request<{ url: string }>(`${root}/invites`, { method: "POST", body: JSON.stringify({ roomId, role, maxUses: 25 }) }),
  heartbeat: (roomId: string, status: "studying" | "typing" | "away", resourceId?: string) => AuthClient.request(`${root}/rooms/${encodeURIComponent(roomId)}/presence`, { method: "POST", body: JSON.stringify({ status, resourceId }) }),
  saveResource: (roomId: string, input: { id?: string; type: CollaborationResourceType; recordId?: string; title: string; data?: unknown; expectedVersion?: number }) => AuthClient.request(`${root}/rooms/${encodeURIComponent(roomId)}/resources`, { method: input.id ? "PATCH" : "POST", body: JSON.stringify(input) }),
  removeResource: (roomId: string, id: string) => AuthClient.request(`${root}/rooms/${encodeURIComponent(roomId)}/resources`, { method: "DELETE", body: JSON.stringify({ id }) }),
  revisions: (roomId:string,resourceId:string)=>AuthClient.request<{revisions:CollaborativeResource[]}>(`${root}/rooms/${encodeURIComponent(roomId)}/resources/${encodeURIComponent(resourceId)}/revisions`),
  restore: (roomId:string,resourceId:string,version:number)=>AuthClient.request(`${root}/rooms/${encodeURIComponent(roomId)}/resources/${encodeURIComponent(resourceId)}/revisions`,{method:"POST",body:JSON.stringify({version})}),
  progress: (roomId:string,input:{resourceId:string;mode:"individual"|"group"|"teacher";completed:number;total:number;score?:number})=>AuthClient.request(`${root}/rooms/${encodeURIComponent(roomId)}/progress`,{method:"POST",body:JSON.stringify(input)}),
  comment: (roomId: string, input: { targetType: CollaborationResourceType | "concept" | "chapter"; targetId: string; parentId?: string; content: string }) => AuthClient.request(`${root}/rooms/${encodeURIComponent(roomId)}/comments`, { method: "POST", body: JSON.stringify(input) }),
  setRole: (roomId: string, userId: string, role: CollaborationRole) => AuthClient.request(`${root}/rooms/${encodeURIComponent(roomId)}/members`, { method: "PATCH", body: JSON.stringify({ userId, role }) }),
  removeMember: (roomId: string, userId: string) => AuthClient.request(`${root}/rooms/${encodeURIComponent(roomId)}/members`, { method: "DELETE", body: JSON.stringify({ userId }) }),
};
