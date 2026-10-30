namespace SnapyOS.Booth.Core;

/// <summary>
/// Antrean serial per resource — kamera menolak dua shutter bersamaan dan job
/// cetak tidak boleh saling mendahului di printer yang sama. Padanan
/// <c>createLock()</c> di <c>runtime/http.ts</c>.
/// </summary>
public sealed class SerialQueue
{
    private readonly SemaphoreSlim _gate = new(1, 1);

    public async Task<T> RunAsync<T>(Func<Task<T>> task, CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            return await task().ConfigureAwait(false);
        }
        finally
        {
            _gate.Release();
        }
    }
}
