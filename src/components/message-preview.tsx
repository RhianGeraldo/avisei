import React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, Image as ImageIcon, ListFilter, Video, Music, File as FileIcon } from "lucide-react";

// Função auxiliar para detectar se uma URL é imagem
export const isImageUrl = (url: string) => {
  if (!url) return false;
  return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/i.test(url.split('?')[0]);
};

interface MessagePreviewProps {
  text: string;
  message?: {
    message_type?: string | null;
    content_data?: any;
    template?: string | null;
  } | null;
  maxW?: string;
}

const RowPreview = ({ text, message }: { text: string, message?: any }) => {
  const isMedia = message?.message_type === "media";
  const content = message?.content_data;
  
  if (isMedia && content?.url) {
    const isImage = content.mediaType === "image" || isImageUrl(content.url);
    const isVideo = content.mediaType === "video";
    const isAudio = content.mediaType === "audio";

    return (
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-md overflow-hidden bg-muted border border-border flex items-center justify-center shrink-0 shadow-inner">
          {isImage ? (
            <img 
              src={content.url} 
              alt="Preview" 
              className="h-full w-full object-cover" 
            />
          ) : isVideo ? (
            <Video className="h-4 w-4 text-primary/70" />
          ) : isAudio ? (
            <Music className="h-4 w-4 text-primary/70" />
          ) : (
            <FileIcon className="h-4 w-4 text-primary/70" />
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="truncate text-foreground font-medium text-xs">{text || "[Sem legenda]"}</span>
          <span className="text-[9px] text-muted-foreground truncate uppercase font-bold tracking-tight">
            {isImage ? "IMAGEM" : (content.mediaType || "mídia")} • {content.filename || "arquivo"}
          </span>
        </div>
      </div>
    );
  }

  if (message?.message_type === "poll") {
    return (
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <ListFilter className="h-4 w-4 text-primary" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="truncate text-foreground font-medium text-xs">{text}</span>
          <span className="text-[9px] text-primary font-bold uppercase tracking-tight">
            Enquete: {content?.pollOptions?.length || 0} opções
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="h-8 w-8 rounded-md bg-muted/30 border border-border flex items-center justify-center shrink-0">
        <FileText className="h-4 w-4 text-muted-foreground/50" />
      </div>
      <span className="truncate text-muted-foreground text-xs">{text}</span>
    </div>
  );
};

export const MessagePreview = ({ text, message, maxW = "280px" }: MessagePreviewProps) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-pointer" style={{ maxWidth: maxW }}>
          <RowPreview text={text} message={message} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-md bg-popover text-popover-foreground border border-border shadow-2xl p-4 rounded-xl">
        <div className="space-y-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
          {message?.content_data?.url && (
            <div className="rounded-lg overflow-hidden border border-border bg-muted/50">
              {message.message_type === "media" && (message.content_data.mediaType === "image" || isImageUrl(message.content_data.url)) ? (
                <img src={message.content_data.url} alt="Full Preview" className="w-full h-auto max-h-[300px] object-contain" />
              ) : message.message_type === "media" && message.content_data.mediaType === "video" ? (
                <video src={message.content_data.url} controls className="w-full max-h-[300px]" />
              ) : message.message_type === "media" && message.content_data.mediaType === "audio" ? (
                <audio src={message.content_data.url} controls className="w-full" />
              ) : (
                <div className="p-3 flex items-center gap-2">
                  <FileIcon className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium truncate">{message.content_data.filename || "Arquivo"}</span>
                </div>
              )}
            </div>
          )}
          {message?.message_type === "poll" && (
            <div className="space-y-2 border-t pt-2">
              <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Opções da Enquete</p>
              <div className="grid grid-cols-1 gap-1">
                {message.content_data?.pollOptions?.map((opt: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-md text-xs">
                    <div className="h-2 w-2 rounded-full border border-primary shrink-0" />
                    {opt}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
