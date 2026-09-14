import { ChevronDown, Folder, FolderOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Material } from "@/types/material";
import { OrganizationFileItem } from "./OrganizationFileItem";

export function OrganizationTree({
  files,
  onRename,
  onMove,
  onDelete,
}: {
  files: Material[];
  onRename: (file: Material) => void;
  onMove: (file: Material) => void;
  onDelete: (file: Material) => void;
}) {
  const courses = Array.from(new Set(files.map((file) => file.course ?? "Curso não informado")));

  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="border-b px-5 py-5 sm:px-6">
        <CardTitle className="text-base">Estrutura dos materiais</CardTitle>
        <p className="text-sm text-muted-foreground">
          Revise a localização de cada arquivo antes de finalizar.
        </p>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        {files.length === 0 ? (
          <div className="rounded-lg border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
            Nenhum material foi importado. Importe arquivos para começar a organização.
          </div>
        ) : (
          <ul aria-label="Árvore de materiais" className="space-y-5">
            {courses.map((course) => {
              const courseFiles = files.filter((file) => (file.course ?? "Curso não informado") === course);
              const semesters = Array.from(
                new Set(courseFiles.map((file) => file.semester ?? "Sem semestre")),
              );

              return (
                <li key={course}>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
                    <FolderOpen className="size-4 text-primary" aria-hidden="true" />
                    {course}
                  </div>
                  <ul className="ml-2 mt-3 space-y-5 border-l pl-4 sm:ml-3 sm:pl-5">
                    {semesters.map((semester) => {
                      const semesterFiles = courseFiles.filter(
                        (file) => (file.semester ?? "Sem semestre") === semester,
                      );
                      const subjects = Array.from(
                        new Set(semesterFiles.map((file) => file.subject ?? "Sem matéria")),
                      );

                      return (
                        <li key={semester}>
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
                            <Folder className="size-4 text-primary" aria-hidden="true" />
                            {semester}
                          </div>
                          <ul className="ml-2 mt-3 space-y-4 border-l pl-4 sm:ml-3 sm:pl-5">
                            {subjects.map((subject) => (
                              <li key={subject}>
                                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                                  <Folder className="size-4 text-primary" aria-hidden="true" />
                                  {subject}
                                </div>
                                <ul className="ml-2 space-y-4 border-l pl-4" aria-label={`${subject}: temas`}>
                                  {Array.from(new Set(
                                    semesterFiles
                                      .filter((file) => (file.subject ?? "Sem matéria") === subject)
                                      .map((file) => file.topic ?? "Sem tema"),
                                  )).map((topic) => (
                                    <li key={topic}>
                                      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                        <Folder className="size-3.5 text-primary" aria-hidden="true" />
                                        {topic}
                                      </div>
                                      <ul className="space-y-2" aria-label={`${topic}: arquivos`}>
                                        {semesterFiles
                                          .filter((file) =>
                                            (file.subject ?? "Sem matéria") === subject &&
                                            (file.topic ?? "Sem tema") === topic,
                                          )
                                          .map((file) => (
                                            <OrganizationFileItem
                                              key={file.id}
                                              file={file}
                                              onRename={onRename}
                                              onMove={onMove}
                                              onDelete={onDelete}
                                            />
                                          ))}
                                      </ul>
                                    </li>
                                  ))}
                                </ul>
                              </li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
