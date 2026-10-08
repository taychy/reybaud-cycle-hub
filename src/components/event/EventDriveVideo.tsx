import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface EventDriveVideoConfig {
  file_id: string;
  title?: string;
}

export default function EventDriveVideo({ video }: { video: EventDriveVideoConfig }) {
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(video.file_id)) return null;
  const fileUrl = `https://drive.google.com/file/d/${video.file_id}`;

  return (
    <section id="video" className="scroll-mt-14 space-y-2 py-2" aria-label={video.title || "Video del viaje"}>
      <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-background">
        <iframe
          src={`${fileUrl}/preview`}
          title={video.title || "Video del viaje"}
          className="block h-full w-full border-0"
          loading="lazy"
          allow="autoplay; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <div className="flex justify-end">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
          <a href={`${fileUrl}/view?usp=drivesdk`} target="_blank" rel="noopener noreferrer">
            Ver video <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </Button>
      </div>
    </section>
  );
}