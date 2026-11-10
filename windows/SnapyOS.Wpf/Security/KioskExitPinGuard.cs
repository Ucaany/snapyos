using SnapyOS.Core;
using SnapyOS.Security;

namespace SnapyOS.Wpf.Security;

public interface IKioskExitPinGuard
{
    bool IsConfigured { get; }
    AdminPinResult Verify(string candidate, out TimeSpan? retryAfter);
}

public sealed class PinServiceKioskExitPinGuard(PinSecurityService security) : IKioskExitPinGuard
{
    public bool IsConfigured => true;

    public AdminPinResult Verify(string candidate, out TimeSpan? retryAfter)
    {
        var result = security.Verify(PinKind.KioskExit, candidate);
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
