using System.Net;
using System.Text.Json;
using SnapyOS.Core;
using Xunit;

namespace SnapyOS.Core.Tests;

public sealed class PaymentClientTests
{
    [Fact]
    public async Task Fake_server_covers_packages_checkout_voucher_qris_and_paid_poll()
    {
        var server = new FakePaymentServer();
        using var client = new HttpClient(server) { BaseAddress = new Uri("https://pay.test") };
        var api = new CloudPaymentClient(client, new InMemoryPaymentStore());

        var packages = await api.FetchPackagesAsync("biz", "box");
        var checkout = await api.CreateCheckoutAsync("biz", packages[0].Id, "device");
        var voucher = await api.ApplyVoucherAsync("biz", checkout.CheckoutSessionId, "SAVE", "device");
        var created = await api.CreatePaymentAsync("biz", checkout.CheckoutSessionId, "qris", "device", "idem-1");
        var pending = await api.PollStatusAsync("biz", created.PaymentReference, "device");
        var paid = await api.PollStatusAsync("biz", created.PaymentReference, "device");

        Assert.Equal("pkg", packages[0].Id);
        Assert.Equal("SAVE", voucher.Code);
        Assert.Equal(8000, voucher.FinalAmount);
        Assert.Equal("qris", created.Display);
        Assert.Equal("qr-emv", created.QrString);
        Assert.Equal("result-token", paid.ResultToken);
        Assert.Equal("qr-emv", created.QrImage);
        Assert.Equal(PaymentClientState.Pending, pending.State);
        Assert.Equal(PaymentClientState.Paid, paid.State);
        Assert.Equal("idem-1", server.LastIdempotencyKey);
    }

    [Theory]
    [InlineData("expired", PaymentClientState.Expired)]
    [InlineData("failed", PaymentClientState.Failed)]
    public async Task Poll_maps_terminal_state(string status, PaymentClientState expected)
    {
        var server = new FakePaymentServer { PollStatus = status };
        using var client = new HttpClient(server) { BaseAddress = new Uri("https://pay.test") };
        var actual = await new CloudPaymentClient(client, new InMemoryPaymentStore()).PollStatusAsync("biz", "pay-ref", "device");
        Assert.Equal(expected, actual.State);
    }

    [Fact]
    public async Task Cash_network_failure_queues_once_then_operator_confirm_succeeds()
    {
        var queue = new InMemoryPaymentStore();
        using var offline = new HttpClient(new NetworkFailureHandler()) { BaseAddress = new Uri("https://pay.test") };
        var api = new CloudPaymentClient(offline, queue);
        await Assert.ThrowsAsync<HttpRequestException>(() => api.CreatePaymentAsync("biz", "checkout", "cash", "device", "idem-cash"));
        await Assert.ThrowsAsync<HttpRequestException>(() => api.CreatePaymentAsync("biz", "checkout", "cash", "device", "idem-cash"));
        Assert.Single(queue.List());

        using var online = new HttpClient(new FakePaymentServer()) { BaseAddress = new Uri("https://pay.test") };
        var confirmed = await new CloudPaymentClient(online, queue).ConfirmCashOnlineAsync("biz", "cash-ref", "device");
        Assert.Equal(PaymentClientState.Paid, confirmed.State);
    }

    [Fact]
    public async Task Unauthorized_response_is_not_queued()
    {
        var queue = new InMemoryPaymentStore();
        using var client = new HttpClient(new UnauthorizedHandler()) { BaseAddress = new Uri("https://pay.test") };
        var api = new CloudPaymentClient(client, queue);
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => api.CreatePaymentAsync("biz", "checkout", "qris", "device", "idem-auth"));
        Assert.Empty(queue.List());
    }

    [Fact]
    public async Task Qris_network_failure_is_not_queued_for_offline_cash_only_mode()
    {
        var queue = new InMemoryPaymentStore();
        using var client = new HttpClient(new NetworkFailureHandler()) { BaseAddress = new Uri("https://pay.test") };
        var api = new CloudPaymentClient(client, queue);
        await Assert.ThrowsAsync<HttpRequestException>(() => api.CreatePaymentAsync("biz", "checkout", "qris", "device", "idem-qris"));
        Assert.Empty(queue.List());
    }

    [Fact]
    public async Task Expired_timestamp_maps_pending_response_to_expired()
    {
        var response = new PaymentView("pending", "pay-ref", "order", "qris", "qris", "qr-emv", null, null, null, null, 9000, 9000, DateTimeOffset.UtcNow.AddMinutes(-1), "checkout");
        using var client = new HttpClient(new StaticPaymentHandler(response)) { BaseAddress = new Uri("https://pay.test") };
        var actual = await new CloudPaymentClient(client, new InMemoryPaymentStore()).PollStatusAsync("biz", "pay-ref", "device");
        Assert.Equal(PaymentClientState.Expired, actual.State);
    }

    [Fact]
    public void Payment_types_expose_no_provider_credentials()
    {
        var forbidden = new[] { "ApiKey", "APIKey", "WebhookSecret", "ServiceRole", "MerchantCredential", "ServerKey", "PrivateKey" };
        var names = typeof(CloudPaymentClient).Assembly.GetTypes().Where(type => type.Namespace == "SnapyOS.Core").SelectMany(type => type.GetProperties().Select(property => property.Name).Concat(type.GetFields().Select(field => field.Name)));
        Assert.False(names.Any(name => forbidden.Any(token => name.Contains(token, StringComparison.OrdinalIgnoreCase))));
    }

    private sealed class FakePaymentServer : HttpMessageHandler
    {
        private int _polls;
        public string PollStatus { get; init; } = "paid";
        public string? LastIdempotencyKey { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastIdempotencyKey = request.Headers.TryGetValues("Idempotency-Key", out var values) ? values.Single() : LastIdempotencyKey;
            var path = request.RequestUri!.AbsolutePath;
            object payload = path.Contains("packages")
                ? new { data = new[] { new { id = "pkg", name = "Basic", price = 10000, photo_count = 2, print_count = 1 } } }
                : path.EndsWith("checkout/apply-voucher")
                    ? new { data = new { checkout_session_id = "checkout", voucher = new { code = "SAVE" }, gross_amount = 9000, discount_amount = 1000, final_amount = 8000 } }
                    : path.EndsWith("checkout")
                        ? new { data = new { checkout_session_id = "checkout", gross_amount = 10000, discount_amount = 0, final_amount = 9000, payment_methods = new[] { new { id = "qris", display = "qris" } } } }
                        : path.EndsWith("cash-confirm")
                            ? Payment("paid", "cash-ref", "cash")
                            : path.EndsWith("payments/create")
                                ? Payment("pending", "pay-ref", "qris")
                                : Payment(_polls++ == 0 && PollStatus == "paid" ? "pending" : PollStatus, "pay-ref", "qris");
            return Task.FromResult(JsonResponse(payload));
        }

        private static object Payment(string status, string reference, string display) => new { data = new { status, payment_reference = reference, order_id = "order", display, method = display, qr_string = display == "qris" ? "qr-emv" : null, qr_image = display == "qris" ? "qr-emv" : null, qr_url = (string?)null, payment_url = (string?)null, va_number = (string?)null, amount = 9000, total_amount = 9000, expires_at = DateTimeOffset.UtcNow.AddMinutes(3), checkout_session_id = "checkout", result_token = status == "paid" ? "result-token" : null } };
    }

    private static HttpResponseMessage JsonResponse(object payload) => new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/json") };

    private sealed class NetworkFailureHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => throw new HttpRequestException("offline");
    }

    private sealed class UnauthorizedHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Unauthorized));
    }

    private sealed class StaticPaymentHandler(PaymentView payment) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(JsonResponse(new { data = payment }));
    }
}
