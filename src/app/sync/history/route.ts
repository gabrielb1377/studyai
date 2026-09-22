import { NextResponse } from "next/server";
import { requireUser, apiError } from "@/server/auth/http";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
export async function GET(request:Request){try{const user=requireUser(request);return NextResponse.json({history:await CloudDatabase.history(user.sub)});}catch(error){return apiError(error);}}
