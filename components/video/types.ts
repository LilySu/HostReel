import type videojs from 'video.js';

export type VideoJsPlayer = ReturnType<typeof videojs>;

export type AnnotationShape = {
  x1: number | null;
  y1: number | null;
  x2: number | null;
  y2: number | null;
};

export type AnnotationComment = {
  id: number;
  meta: {
    datetime: string;
    user_id: string;
    user_name: string;
  };
  body: string;
};

export type AnnotationObject = {
  id: number;
  range: { start: number; end: number };
  shape: AnnotationShape;
  comments: AnnotationComment[];
};

export type AnnotationOpenedEvent = {
  detail: {
    annotation: AnnotationObject;
    triggered_by_timeline: boolean;
  };
};

export type AnnotationCommentsPluginOptions = {
  annotationsObjects?: AnnotationObject[];
  meta?: { user_id: string; user_name: string };
  bindArrowKeys?: boolean;
  showControls?: boolean;
  showCommentList?: boolean;
  showFullScreen?: boolean;
  showMarkerShapeAndTooltips?: boolean;
  internalCommenting?: boolean;
  startInAnnotationMode?: boolean;
};

export type AnnotationCommentsPlugin = {
  onReady: (cb: () => void) => void;
  registerListener: (
    eventName: string,
    handler: (event: { detail: unknown }) => void,
  ) => void;
  fire: (eventName: string, payload?: Record<string, unknown>) => void;
};

export type PlayerWithAnnotations = VideoJsPlayer & {
  annotationComments: (
    options: AnnotationCommentsPluginOptions,
  ) => AnnotationCommentsPlugin;
};
