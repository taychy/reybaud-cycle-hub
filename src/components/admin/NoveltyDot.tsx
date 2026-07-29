import { isNewSince } from "@/lib/adminNovelty";

/** Pelotita roja de novedad. Se usa en el sidebar y dentro de las secciones. */
export const NoveltyDot = ({
  className = "",
  title = "Novedad sin ver",
}: {
  className?: string;
  title?: string;
}) => (
  <span
    title={title}
    className={`inline-block w-2 h-2 rounded-full bg-destructive animate-pulse shrink-0 ${className}`}
  />
);

/** Pelotita que aparece solo si el registro es posterior a la última visita a la sección. */
export const NewSinceDot = ({
  createdAt,
  section,
  className = "",
}: {
  createdAt: string | null | undefined;
  section: string;
  className?: string;
}) => {
  if (!isNewSince(createdAt, section)) return null;
  return <NoveltyDot className={className} title="Nuevo desde tu última visita" />;
};

export default NoveltyDot;
