using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Nodes;

namespace SnapyOS.Core;

public enum PaymentClientState { Pending, Paid, Expired, Failed, CashPending, OfflineQueued }
public sealed record PackageSummary([property: JsonPropertyName("id")] string Id, [property: JsonPropertyName("name")] string Name, [property: JsonPropertyName("price")] long Price, [property: JsonPropertyName("photo_count")] int PhotoCount, [property: JsonPropertyName("print_count")] int PrintCount);
public sealed record CheckoutSummary([property: JsonPropertyName("checkout_session_id")] string CheckoutSessionId, [property: JsonPropertyName("gross_amount")] long GrossAmount, [property: JsonPropertyName("discount_amount")] long DiscountAmount, [property: JsonPropertyName("final_amount")] long FinalAmount, [property: JsonPropertyName("payment_methods")] IReadOnlyList<JsonObject> PaymentMethods);
public sealed record PaymentView([property: JsonPropertyName("status")] string Status, [property: JsonPropertyName("payment_reference")] string PaymentReference, [property: JsonPropertyName("order_id")] string OrderId, [property: JsonPropertyName("display")] string Display, [property: JsonPropertyName("method")] string Method, [property: JsonPropertyName("qr_string")] string? QrString, [property: JsonPropertyName("qr_image")] string? QrImage, [property: JsonPropertyName("qr_url")] string? QrUrl, [property: JsonPropertyName("payment_url")] string? PaymentUrl, [property: JsonPropertyName("va_number")] string? VaNumber, [property: JsonPropertyName("amount")] long Amount, [property: JsonPropertyName("total_amount")] long TotalAmount, [property: JsonPropertyName("expires_at")] DateTimeOffset? ExpiresAt, [property: JsonPropertyName("checkout_session_id")] string CheckoutSessionId, [property: JsonPropertyName("result_token")] string? ResultToken = null)
{
    public PaymentClientState State
    {
        get
        {
            if (Status.Equals("paid", StringComparison.OrdinalIgnoreCase)) return PaymentClientState.Paid;
            if (Status.Equals("expired", StringComparison.OrdinalIgnoreCase) || (ExpiresAt is not null && ExpiresAt <= DateTimeOffset.UtcNow)) return PaymentClientState.Expired;
            if (Status.Equals("failed", StringComparison.OrdinalIgnoreCase) || Status.Equals("cancelled", StringComparison.OrdinalIgnoreCase) || Status.Equals("canceled", StringComparison.OrdinalIgnoreCase)) return PaymentClientState.Failed;
            if (Display.Equals("cash", StringComparison.OrdinalIgnoreCase)) return PaymentClientState.CashPending;
            return PaymentClientState.Pending;
        }
    }
}
public sealed record VoucherView([property: JsonPropertyName("checkout_session_id")] string CheckoutSessionId, [property: JsonPropertyName("voucher")] VoucherCodeView? Voucher, [property: JsonPropertyName("gross_amount")] long GrossAmount, [property: JsonPropertyName("discount_amount")] long DiscountAmount, [property: JsonPropertyName("final_amount")] long FinalAmount)
{
    public string? Code => Voucher?.Code;
}

public sealed record VoucherCodeView([property: JsonPropertyName("code")] string Code);

/// <summary>Queued payment intent for replay after reconnect. Deliberately carries no device token or credential material.</summary>
public sealed record LocalPaymentQueueItem(string IdempotencyKey, string BusinessSlug, string CheckoutSessionId, string MethodId, DateTimeOffset QueuedAt, PaymentClientState State);

public interface ILocalPaymentStore
{
    void Enqueue(LocalPaymentQueueItem item);
    IReadOnlyList<LocalPaymentQueueItem> List();
}

public sealed class InMemoryPaymentStore : ILocalPaymentStore
{
    private readonly List<LocalPaymentQueueItem> _items = [];
    public void Enqueue(LocalPaymentQueueItem item) { if (_items.All(x => x.IdempotencyKey != item.IdempotencyKey)) _items.Add(item); }
    public IReadOnlyList<LocalPaymentQueueItem> List() => _items;
}

/// <summary>Cloud-authoritative payment calls. Credential material remains outside the device.</summary>
public sealed class CloudPaymentClient
{
    private readonly HttpClient _http;
    private readonly ILocalPaymentStore _queue;
    private readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);

    public CloudPaymentClient(HttpClient http, ILocalPaymentStore queue) { _http = http; _queue = queue; }

    public Task<IReadOnlyList<PackageSummary>> FetchPackagesAsync(string businessSlug, string photoboxSlug, CancellationToken cancellationToken = default) =>
        GetDataAsync<IReadOnlyList<PackageSummary>>($"/api/v1/public/{Uri.EscapeDataString(businessSlug)}/packages?photobox={Uri.EscapeDataString(photoboxSlug)}", cancellationToken);

    public Task<CheckoutSummary> CreateCheckoutAsync(string businessSlug, string packageId, string deviceToken, string? voucherCode = null, CancellationToken cancellationToken = default) =>
        PostDataAsync<CheckoutCreateRequest, CheckoutSummary>($"/api/v1/public/{Uri.EscapeDataString(businessSlug)}/checkout", new(packageId, deviceToken, voucherCode), cancellationToken);

    public Task<VoucherView> ApplyVoucherAsync(string businessSlug, string checkoutSessionId, string code, string deviceToken, CancellationToken cancellationToken = default) =>
        PostDataAsync<CheckoutVoucherRequest, VoucherView>($"/api/v1/public/{Uri.EscapeDataString(businessSlug)}/checkout/apply-voucher", new(checkoutSessionId, code, deviceToken), cancellationToken);

    public async Task<PaymentView> CreatePaymentAsync(string businessSlug, string checkoutSessionId, string methodId, string deviceToken, string idempotencyKey, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey)) throw new ArgumentException("Idempotency key is required.", nameof(idempotencyKey));
        var request = new PaymentCreateRequest(checkoutSessionId, methodId, deviceToken);
        try
        {
            return await PostDataAsync<PaymentCreateRequest, PaymentView>(
                $"/api/v1/public/{Uri.EscapeDataString(businessSlug)}/payments/create",
                request,
                cancellationToken,
                message => message.Headers.TryAddWithoutValidation("Idempotency-Key", idempotencyKey)).ConfigureAwait(false);
        }
        catch (HttpRequestException exception) when (!cancellationToken.IsCancellationRequested && exception.StatusCode is null && methodId.Equals("cash", StringComparison.OrdinalIgnoreCase))
        {
            _queue.Enqueue(new LocalPaymentQueueItem(idempotencyKey, businessSlug, checkoutSessionId, methodId, DateTimeOffset.UtcNow, PaymentClientState.OfflineQueued));
            throw;
        }
    }

    public async Task<PaymentView> PollStatusAsync(string businessSlug, string paymentReference, string deviceToken, CancellationToken cancellationToken = default)
    {
        var payment = await GetDataAsync<PaymentView>($"/api/v1/public/{Uri.EscapeDataString(businessSlug)}/payments/{Uri.EscapeDataString(paymentReference)}/status?device_token={Uri.EscapeDataString(deviceToken)}", cancellationToken).ConfigureAwait(false);
        return payment.State == PaymentClientState.Pending && payment.ExpiresAt <= DateTimeOffset.UtcNow
            ? payment with { Status = "expired" }
            : payment;
    }

    public Task<PaymentView> ConfirmCashOnlineAsync(string businessSlug, string paymentReference, string deviceToken, CancellationToken cancellationToken = default) =>
        PostDataAsync<CashConfirmRequest, PaymentView>($"/api/v1/public/{Uri.EscapeDataString(businessSlug)}/payments/cash-confirm", new(paymentReference, deviceToken), cancellationToken);

    private async Task<T> GetDataAsync<T>(string path, CancellationToken cancellationToken)
    {
        var response = await _http.GetAsync(path, cancellationToken).ConfigureAwait(false);
        return await ReadDataAsync<T>(response, cancellationToken).ConfigureAwait(false);
    }

    private async Task<T> PostDataAsync<TRequest, T>(string path, TRequest request, CancellationToken cancellationToken, Action<HttpRequestMessage>? configure = null)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(request, options: _json) };
        configure?.Invoke(message);
        using var response = await _http.SendAsync(message, cancellationToken).ConfigureAwait(false);
        return await ReadDataAsync<T>(response, cancellationToken).ConfigureAwait(false);
    }

    private async Task<T> ReadDataAsync<T>(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.StatusCode == HttpStatusCode.Unauthorized || response.StatusCode == HttpStatusCode.Forbidden) throw new UnauthorizedAccessException("Payment device authentication rejected.");
        response.EnsureSuccessStatusCode();
        var envelope = await response.Content.ReadFromJsonAsync<ApiEnvelope<T>>(_json, cancellationToken).ConfigureAwait(false) ?? throw new InvalidOperationException("Payment response empty.");
        return envelope.Data ?? throw new InvalidOperationException("Payment data empty.");
    }

    private sealed record ApiEnvelope<T>([property: JsonPropertyName("data")] T? Data);
    private sealed record CheckoutCreateRequest([property: JsonPropertyName("package_id")] string PackageId, [property: JsonPropertyName("device_token")] string DeviceToken, [property: JsonPropertyName("voucher_code")] string? VoucherCode);
    private sealed record CheckoutVoucherRequest([property: JsonPropertyName("checkout_session_id")] string CheckoutSessionId, [property: JsonPropertyName("voucher_code")] string VoucherCode, [property: JsonPropertyName("device_token")] string DeviceToken);
    private sealed record PaymentCreateRequest([property: JsonPropertyName("checkout_session_id")] string CheckoutSessionId, [property: JsonPropertyName("method_id")] string MethodId, [property: JsonPropertyName("device_token")] string DeviceToken);
    private sealed record CashConfirmRequest([property: JsonPropertyName("payment_reference")] string PaymentReference, [property: JsonPropertyName("device_token")] string DeviceToken);
}
