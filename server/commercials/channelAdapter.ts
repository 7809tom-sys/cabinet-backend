import type { CommercialChannel } from "@shared/commercialVideo";

/**
 * One platform's publish call. A later change adds a real adapter beside the
 * dry-run one. This module has no credentials and does not call fetch.
 */
export type ChannelPublishRequest = {
  channel: CommercialChannel;
  commercialId: number;
  title: string;
  caption: string | null;
  fileUrl: string;
  mimeType: string;
  durationSeconds: number | null;
};

export type ChannelPublishResult = {
  ok: boolean;
  externalPostId: string | null;
  externalPostUrl: string | null;
  error: string | null;
};

export interface ChannelAdapter {
  readonly channel: CommercialChannel;
  publish(request: ChannelPublishRequest): Promise<ChannelPublishResult>;
}

/**
 * The only adapter wired in. It records nothing externally and posts nothing.
 * A failed dry run is how the admin learns the channel is not connected.
 */
export class DryRunChannelAdapter implements ChannelAdapter {
  constructor(readonly channel: CommercialChannel) {}

  async publish(request: ChannelPublishRequest): Promise<ChannelPublishResult> {
    return {
      ok: false,
      externalPostId: null,
      externalPostUrl: null,
      error: `Dry run: nothing was posted to ${request.channel}. No social account is connected.`,
    };
  }
}

export function dryRunAdapterFor(channel: CommercialChannel): ChannelAdapter {
  return new DryRunChannelAdapter(channel);
}
