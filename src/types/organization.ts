export type OrganizationFileType = "pdf" | "video" | "document";

export type OrganizationFile = {
  id: string;
  name: string;
  type: OrganizationFileType;
  typeLabel: string;
  size: string;
  course: string;
  semester: string;
  subject: string;
};

export type OrganizationDestination = Pick<
  OrganizationFile,
  "semester" | "subject"
>;
