using SnapyOS.Core;

namespace SnapyOS.LocalStore;

public sealed class LocalGifOutbox(LocalStore store)
{
    private readonly LocalStore _store = store;

    public MediaRecord RegisterOutput(string mediaId, string sessionId, LocalGifOutput output, DateTimeOffset retentionUntil)
    {
        var relative = Path.GetRelativePath(_store.MediaRoot, output.Path);
        return _store.RegisterMedia(mediaId, sessionId, relative, "gif", retentionUntil);
    }
}
