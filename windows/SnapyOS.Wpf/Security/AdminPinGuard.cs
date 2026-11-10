using SnapyOS.Core;
using SnapyOS.Security;

namespace SnapyOS.Wpf.Security;

public enum AdminPinResult
{
    Success,
    NotConfigured,
    Invalid,
    LockedOut
}

public interface IAdminPinGuard
{
    bool IsConfigured { get; }
    AdminPinResult Verify(string candidate, out TimeSpan? retryAfter);
}

public sealed class PinServiceAdminPinGuard(PinSecurityService security) : IAdminPinGuard
{
    public bool IsConfigured => true;

    public AdminPinResult Verify(string candidate, out TimeSpan? retryAfter)
    {
        var result = security.Verify(PinKind.Admin, candidate);
        retryAfter = result.RetryAfter;
        return result.Status switch
        {
            PinVerificationStatus.Success => AdminPinResult.Success,
            PinVerificationStatus.NotConfigured => AdminPinResult.NotConfigured,
            PinVerificationStatus.LockedOut => AdminPinResult.LockedOut,
            _ => AdminPinResult.Invalid
        };
    }
}
