using SnapyOS.Core;

namespace SnapyOS.LocalStore;

public sealed class PaymentQueueRepository(LocalStore store) : ILocalPaymentStore
{
    private readonly LocalStore _store = store;

    public void Enqueue(LocalPaymentQueueItem item)
    {
        _store.Execute(@"CREATE TABLE IF NOT EXISTS payment_queue(
            idempotency_key TEXT PRIMARY KEY,
            business_slug TEXT NOT NULL,
            checkout_session_id TEXT NOT NULL,
            method_id TEXT NOT NULL,
            queued_at TEXT NOT NULL,
            state TEXT NOT NULL
        );", null);
        _store.Execute(@"INSERT OR IGNORE INTO payment_queue(idempotency_key, business_slug, checkout_session_id, method_id, queued_at, state)
VALUES($key, $business, $checkout, $method, $queued, $state);", null,
            ("$key", item.IdempotencyKey), ("$business", item.BusinessSlug),
            ("$checkout", item.CheckoutSessionId), ("$method", item.MethodId),
            ("$queued", item.QueuedAt.ToString("O")), ("$state", item.State.ToString()));
    }

    public IReadOnlyList<LocalPaymentQueueItem> List()
    {
        _store.Execute("CREATE TABLE IF NOT EXISTS payment_queue(idempotency_key TEXT PRIMARY KEY, business_slug TEXT NOT NULL, checkout_session_id TEXT NOT NULL, method_id TEXT NOT NULL, queued_at TEXT NOT NULL, state TEXT NOT NULL);", null);
        using var command = _store.CreatePublicCommand("SELECT idempotency_key, business_slug, checkout_session_id, method_id, queued_at, state FROM payment_queue ORDER BY queued_at;");
        using var reader = command.ExecuteReader();
        var items = new List<LocalPaymentQueueItem>();
        while (reader.Read())
        {
            items.Add(new(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), DateTimeOffset.Parse(reader.GetString(4)), Enum.Parse<PaymentClientState>(reader.GetString(5))));
        }
        return items;
    }
}
