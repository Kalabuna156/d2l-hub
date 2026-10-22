/**
 * Study video picks. For one course file, the user's AI chooses the most useful
 * topic on a specific YouTube channel. The link is a channel-scoped search, so
 * it never points at a video that has been deleted or misremembered by the model.
 */

import type { StudyVideoChannel, StudyVideoSuggestion } from '../shared/types';
import { aiStatus, askAiJson } from './ai';
import { outlineFor, shortCourseCode } from './outlines';

interface ChannelInfo {
  name: string;
  channelId: string;
  focus: string;
}

export const STUDY_VIDEO_CHANNELS: Record<StudyVideoChannel, ChannelInfo> = {
  '3blue1brown': {
    name: '3Blue1Brown',
    channelId: 'UCYO_jab_esuFRV4b17AJtAw',
    focus:
      'visual, concept-first mathematics: calculus, linear algebra, differential equations, probability, and the math behind science',
  },
  'organic-chem-tutor': {
    name: 'The Organic Chemistry Tutor',
    channelId: 'UCEWpbFLzoYGPfuWUMFPSaoA',
    focus:
      'worked-example videos for general and organic chemistry, physics, algebra, trigonometry, precalculus and calculus',
  },
};

interface StudyVideoInput {
  channel?: unknown;
  fileTitle?: unknown;
  fileName?: unknown;
  fileType?: unknown;
  courseCode?: unknown;
  courseName?: unknown;
  assessmentTitle?: unknown;
}

interface AiVideoReply {
  title?: unknown;
  query?: unknown;
  reason?: unknown;
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function channelSearchUrl(channelId: string, query: string): string {
  return `https://www.youtube.com/channel/${channelId}/search?query=${encodeURIComponent(query)}`;
}

/** A sensible search when no AI key is configured yet. */
export function fallbackVideoQuery(fileTitle: string, courseName: string): string {
  const title = fileTitle
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/\b(?:lecture|lectures|notes?|slides?|handout|worksheet|copy|final)\b/gi, ' ')
    .replace(/[|_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const base = title.length >= 3 ? title : courseName;
  return (base || 'study topic').slice(0, 100);
}

function fallbackSuggestion(
  channel: StudyVideoChannel,
  info: ChannelInfo,
  fileTitle: string,
  courseName: string,
): StudyVideoSuggestion {
  const query = fallbackVideoQuery(fileTitle, courseName);
  return {
    channel,
    channelName: info.name,
    title: `Find ${query} on ${info.name}`,
    query,
    reason: 'Add your own AI key in Settings → AI and this icon will pick a specific video for the file.',
    url: channelSearchUrl(info.channelId, query),
    fromAi: false,
  };
}

export async function recommendStudyVideo(input: StudyVideoInput): Promise<StudyVideoSuggestion> {
  const channel = input.channel as StudyVideoChannel;
  const info = STUDY_VIDEO_CHANNELS[channel];
  if (!info) throw new Error('Choose 3Blue1Brown or The Organic Chemistry Tutor.');

  const fileTitle = clean(input.fileTitle, 200) || clean(input.fileName, 200) || 'Course file';
  const courseCode = clean(input.courseCode, 40) || null;
  const courseName = clean(input.courseName, 160) || courseCode || 'this course';
  const assessmentTitle = clean(input.assessmentTitle, 160) || 'an upcoming assessment';
  const fileType = clean(input.fileType, 80);

  const status = aiStatus();
  if (!status.configured) return fallbackSuggestion(channel, info, fileTitle, courseName);

  const code = courseCode ? shortCourseCode(courseCode, courseName) : null;
  const outline = code ? outlineFor(code) : null;

  const prompt = `You are choosing what a university student should watch on the ${info.name} YouTube channel to understand one course file.

Course: ${courseName}${code ? ` (${code})` : ''}
Assessment being prepared for: ${assessmentTitle}
File the student is opening: "${fileTitle}"${fileType ? ` (${fileType})` : ''}
That channel covers: ${info.focus}

Pick the single most useful topic or video on this channel for this file. Stay specific to the file's subject.
If the file is outside the channel's usual subjects, choose the closest foundational topic and say so in the reason.

Return JSON only:
{"title":"the specific topic or video title","query":"3-8 search words for this channel","reason":"one sentence on why this helps with this file"}

Rules:
- Do not include the channel name, "YouTube", "video", or quotation marks in query.
- Do not invent a video URL.
- Prefer a topic the channel actually covers over a generic study tip.
${outline ? `\nCourse outline excerpt:\n${outline.text.slice(0, 12_000)}` : ''}`;

  let reply: AiVideoReply;
  try {
    reply = await askAiJson<AiVideoReply>(prompt, { maxTokens: 1_500 });
  } catch (error) {
    // A failed key must not make the button useless: offer the channel search
    // and surface the provider's reason in the panel.
    const message = error instanceof Error ? error.message : 'The AI could not pick a video.';
    const fallback = fallbackSuggestion(channel, info, fileTitle, courseName);
    return {
      ...fallback,
      reason: `${message} Showing a channel search for this file instead.`.slice(0, 400),
    };
  }

  const title = clean(reply.title, 140);
  const query = clean(reply.query, 140).replace(/^["'“”]+|["'“”]+$/g, '');
  const reason = clean(reply.reason, 400);
  const finalQuery = query || title || fallbackVideoQuery(fileTitle, courseName);

  return {
    channel,
    channelName: info.name,
    title: title || finalQuery,
    query: finalQuery,
    reason: reason || `A focused ${info.name} search for this file.`,
    url: channelSearchUrl(info.channelId, finalQuery),
    fromAi: true,
  };
}
