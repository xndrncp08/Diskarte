import { z } from "zod";
export const resourceSchema = z.object({ id:z.uuid(),title:z.string().trim().min(1).max(160),url:z.url().max(1000).refine((url)=>url.startsWith("https://")),description:z.string().max(300) });
export const resourcesSchema = z.object({items:z.array(resourceSchema).max(30)});
export const STROKE_COLORS = ["#142138","#b91c1c","#1d4ed8","#047857","#854d0e"] as const;
export const strokeSchema = z.object({id:z.uuid(),color:z.enum(STROKE_COLORS),width:z.number().min(1).max(12),points:z.array(z.tuple([z.number().min(0).max(1200),z.number().min(0).max(800)])).min(1).max(256)});
export const whiteboardSchema = z.object({strokes:z.array(strokeSchema).max(100)}).refine((value)=>value.strokes.reduce((total,s)=>total+s.points.length,0)<=2500);
export type Stroke = z.infer<typeof strokeSchema>;
