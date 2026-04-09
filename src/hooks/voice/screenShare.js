export const SCREEN_SHARE_QUALITY_PROFILES = {
  '1080p': {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 60 },
    bitrate: 6000000,
    contentHint: 'detail',
  },
  '720p': {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
    bitrate: 2500000,
    contentHint: 'detail',
  },
  '480p': {
    width: { ideal: 854 },
    height: { ideal: 480 },
    frameRate: { ideal: 30 },
    bitrate: 1000000,
    contentHint: 'detail',
  },
};

export function getScreenShareProfile(quality = '720p') {
  return SCREEN_SHARE_QUALITY_PROFILES[quality] || SCREEN_SHARE_QUALITY_PROFILES['720p'];
}

export function buildScreenShareConstraints(profile, sourceId = null) {
  if (sourceId) {
    return {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          minWidth: profile.width.ideal,
          maxWidth: profile.width.ideal,
          minHeight: profile.height.ideal,
          maxHeight: profile.height.ideal,
          maxFrameRate: profile.frameRate.ideal,
        },
      },
    };
  }

  return {
    video: {
      ...profile,
      cursor: 'always',
    },
    audio: false,
  };
}

export async function applyScreenShareSenderQuality(sender, profile) {
  if (!sender || !sender.getParameters) return;

  try {
    const params = sender.getParameters();
    if (!params.encodings) {
      params.encodings = [{}];
    }

    params.encodings[0].maxBitrate = profile.bitrate;
    params.encodings[0].networkPriority = 'high';
    await sender.setParameters(params);
  } catch (error) {
    console.warn('[WebRTC] Failed to set encoding parameters:', error);
  }
}

export async function attachScreenShareToPeers(peerConnections, stream, profile) {
  const tracks = stream.getTracks();
  const peers = Object.values(peerConnections);

  await Promise.all(peers.map(async (peerConnection) => {
    for (const track of tracks) {
      const sender = peerConnection.addTrack(track, stream);
      if (track.kind === 'video') {
        await applyScreenShareSenderQuality(sender, profile);
      }
    }
  }));
}

export async function detachScreenShareFromPeers(peerConnections) {
  const peers = Object.values(peerConnections);

  await Promise.all(peers.map(async (peerConnection) => {
    const senders = peerConnection.getSenders();
    await Promise.all(senders.map(async (sender) => {
      if (sender.track?.kind !== 'video') return;

      try {
        await sender.replaceTrack(null);
        peerConnection.removeTrack(sender);
      } catch (error) {
        console.warn(error);
      }
    }));
  }));
}
