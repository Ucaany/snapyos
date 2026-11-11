using Microsoft.Extensions.Hosting;
using SnapyOS.Core;

namespace SnapyOS.Wpf.Services;

public sealed class OutputSyncHostedService(ResultSyncWorker worker) : BackgroundService
{
    private readonly ResultSyncWorker _worker = worker;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken).ConfigureAwait(false);
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(15));
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
            await _worker.RunOnceAsync(stoppingToken).ConfigureAwait(false);
    }
}
