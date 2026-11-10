using System.Drawing;
using System.Drawing.Imaging;
using System.Security.Cryptography;
using System.Text;

namespace SnapyOS.Core;

public sealed record GifFrameInput(string Path, TimeSpan Duration, CameraRotation Rotation = CameraRotation.None);

public sealed record LocalGifOptions(int LoopCount = 0, long MaxMemoryBytes = 64 * 1024 * 1024, TimeSpan? OperationTimeout = null)
{
    public TimeSpan EffectiveTimeout => OperationTimeout ?? TimeSpan.FromSeconds(30);
}

public sealed record LocalGifOutput(string Path, long SizeBytes, string Sha256, int Width, int Height, int FrameCount, int LoopCount);

public sealed class LocalGifRenderer
{
    public async Task<LocalGifOutput> RenderAsync(
        IReadOnlyList<GifFrameInput> frames,
        string outputPath,
        LocalGifOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        options ??= new LocalGifOptions();
        ValidateInputs(frames, outputPath, options);

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(options.EffectiveTimeout);
        var token = timeout.Token;
        var fullOutputPath = Path.GetFullPath(outputPath);
        var outputDirectory = Path.GetDirectoryName(fullOutputPath) ?? ".";
        Directory.CreateDirectory(outputDirectory);
        var temporaryPath = Path.Combine(outputDirectory, $".{Path.GetFileName(fullOutputPath)}.{Guid.NewGuid():N}.tmp");

        try
        {
            using var first = LoadFrame(frames[0], token);
            var width = first.Width;
            var height = first.Height;
            ValidateDimensions(width, height);
            var frameMemoryBytes = EstimateFrameMemory(width, height);
            if (frameMemoryBytes > options.MaxMemoryBytes)
                throw new InvalidOperationException("GIF memory limit exceeded.");

            await using (var stream = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 64 * 1024, FileOptions.SequentialScan))
            {
                var encoder = new GifEncoder(stream, width, height, options.LoopCount);
                encoder.WriteHeader();
                encoder.WriteFrame(first, DurationCentiseconds(frames[0].Duration), token);

                for (var index = 1; index < frames.Count; index++)
                {
                    token.ThrowIfCancellationRequested();
                    using var bitmap = LoadFrame(frames[index], token);
                    if (bitmap.Width != width || bitmap.Height != height)
                        throw new InvalidOperationException("All GIF frames must share one orientation and resolution.");
                    encoder.WriteFrame(bitmap, DurationCentiseconds(frames[index].Duration), token);
                }

                encoder.Complete();
                await stream.FlushAsync(token).ConfigureAwait(false);
            }

            token.ThrowIfCancellationRequested();
            var info = new FileInfo(temporaryPath);
            var checksum = await ComputeSha256Async(temporaryPath, token).ConfigureAwait(false);
            token.ThrowIfCancellationRequested();
            File.Move(temporaryPath, fullOutputPath, true);
            return new LocalGifOutput(fullOutputPath, info.Length, checksum, width, height, frames.Count, options.LoopCount);
        }
        finally
        {
            TryDelete(temporaryPath);
        }
    }

    private static Bitmap LoadFrame(GifFrameInput input, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        ValidateLocalPath(input.Path, nameof(input));
        if (!File.Exists(input.Path)) throw new FileNotFoundException("GIF frame not found.", input.Path);

        using var source = new Bitmap(input.Path);
        var frame = new Bitmap(source);
        if (input.Rotation == CameraRotation.None) return frame;
        frame.RotateFlip(input.Rotation switch
        {
            CameraRotation.Clockwise90 => RotateFlipType.Rotate90FlipNone,
            CameraRotation.HalfTurn => RotateFlipType.Rotate180FlipNone,
            CameraRotation.Clockwise270 => RotateFlipType.Rotate270FlipNone,
            _ => throw new ArgumentOutOfRangeException(nameof(input), "Unsupported frame rotation.")
        });
        return frame;
    }

    private static void ValidateInputs(IReadOnlyList<GifFrameInput> frames, string outputPath, LocalGifOptions options)
    {
        if (frames is null || frames.Count == 0) throw new ArgumentException("At least one GIF frame is required.", nameof(frames));
        if (string.IsNullOrWhiteSpace(outputPath)) throw new ArgumentException("GIF output path is required.", nameof(outputPath));
        ValidateLocalPath(outputPath, nameof(outputPath));
        if (options.MaxMemoryBytes < 1) throw new ArgumentOutOfRangeException(nameof(options), "MaxMemoryBytes must be positive.");
        if (options.LoopCount is < 0 or > ushort.MaxValue) throw new ArgumentOutOfRangeException(nameof(options), "LoopCount is out of range.");
        if (options.EffectiveTimeout <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(options), "OperationTimeout must be positive.");

        var fullOutputPath = Path.GetFullPath(outputPath);
        foreach (var frame in frames)
        {
            if (string.IsNullOrWhiteSpace(frame.Path)) throw new ArgumentException("GIF frame path is required.", nameof(frames));
            ValidateLocalPath(frame.Path, nameof(frames));
            if (frame.Duration <= TimeSpan.Zero) throw new ArgumentException("GIF frame duration must be positive.", nameof(frames));
            if (!Enum.IsDefined(frame.Rotation)) throw new ArgumentException("GIF frame rotation is invalid.", nameof(frames));
            if (string.Equals(Path.GetFullPath(frame.Path), fullOutputPath, StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException("GIF output must not overwrite an input frame.", nameof(outputPath));
        }
    }

    private static void ValidateLocalPath(string path, string parameterName)
    {
        if (path.Contains("://", StringComparison.Ordinal) ||
            (!Path.IsPathRooted(path) && Uri.TryCreate(path, UriKind.Absolute, out var uri) && uri.Scheme.Length > 0))
            throw new ArgumentException("GIF renderer accepts local filesystem paths only.", parameterName);
    }

    private static void ValidateDimensions(int width, int height)
    {
        if (width is <= 0 or > ushort.MaxValue || height is <= 0 or > ushort.MaxValue)
            throw new InvalidOperationException("GIF frame dimensions must fit the GIF format.");
    }

    private static long EstimateFrameMemory(int width, int height) => checked((long)width * height * 5 + 64 * 1024);

    private static ushort DurationCentiseconds(TimeSpan duration) =>
        (ushort)Math.Clamp((int)Math.Round(duration.TotalMilliseconds / 10), 1, ushort.MaxValue);

    private static async Task<string> ComputeSha256Async(string path, CancellationToken cancellationToken)
    {
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.SequentialScan);
        var hash = await SHA256.HashDataAsync(stream, cancellationToken).ConfigureAwait(false);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    private sealed class GifEncoder(Stream output, int width, int height, int loopCount)
    {
        public void WriteHeader()
        {
            WriteAscii("GIF89a");
            WriteUInt16((ushort)width);
            WriteUInt16((ushort)height);
            output.WriteByte(0xF7);
            output.WriteByte(0);
            output.WriteByte(0);
            for (var index = 0; index < 256; index++)
            {
                output.WriteByte((byte)((index >> 5) * 255 / 7));
                output.WriteByte((byte)(((index >> 2) & 7) * 255 / 7));
                output.WriteByte((byte)((index & 3) * 255 / 3));
            }

            WriteBytes([0x21, 0xFF, 0x0B]);
            WriteAscii("NETSCAPE2.0");
            WriteBytes([0x03, 0x01]);
            WriteUInt16((ushort)loopCount);
            WriteByte(0);
        }

        public void WriteFrame(Bitmap bitmap, ushort delay, CancellationToken token)
        {
            var pixels = new byte[checked(width * height)];
            for (var y = 0; y < height; y++)
            {
                token.ThrowIfCancellationRequested();
                for (var x = 0; x < width; x++)
                {
                    var color = bitmap.GetPixel(x, y);
                    pixels[y * width + x] = (byte)(((color.R >> 5) << 5) | ((color.G >> 5) << 2) | (color.B >> 6));
                }
            }

            WriteBytes([0x21, 0xF9, 0x04, 0x00]);
            WriteUInt16(delay);
            WriteBytes([0x00, 0x00, 0x00]);
            WriteByte(0x2C);
            WriteUInt16(0);
            WriteUInt16(0);
            WriteUInt16((ushort)width);
            WriteUInt16((ushort)height);
            WriteByte(0);
            WriteByte(8);
            LzwEncode(pixels, token);
        }

        public void Complete() => WriteByte(0x3B);

        private void LzwEncode(byte[] pixels, CancellationToken token)
        {
            const int minimumCodeSize = 8;
            var clear = 1 << minimumCodeSize;
            var end = clear + 1;
            var nextCode = end + 1;
            var codeSize = minimumCodeSize + 1;
            var dictionary = new Dictionary<(int Prefix, byte Value), int>(4096);
            var blocks = new GifSubBlockWriter(output);
            var buffer = 0;
            var bitCount = 0;

            void Emit(int code)
            {
                buffer |= code << bitCount;
                bitCount += codeSize;
                while (bitCount >= 8)
                {
                    blocks.Write((byte)buffer);
                    buffer >>= 8;
                    bitCount -= 8;
                }
            }

            Emit(clear);
            var prefix = (int)pixels[0];
            for (var index = 1; index < pixels.Length; index++)
            {
                token.ThrowIfCancellationRequested();
                var value = pixels[index];
                if (dictionary.TryGetValue((prefix, value), out var found))
                {
                    prefix = found;
                    continue;
                }

                Emit(prefix);
                if (nextCode < 4096)
                {
                    dictionary[(prefix, value)] = nextCode++;
                    if (nextCode == (1 << codeSize) && codeSize < 12) codeSize++;
                }
                else
                {
                    Emit(clear);
                    dictionary.Clear();
                    nextCode = end + 1;
                    codeSize = minimumCodeSize + 1;
                }
                prefix = value;
            }

            Emit(prefix);
            Emit(end);
            if (bitCount > 0) blocks.Write((byte)buffer);
            blocks.Complete();
        }

        private void WriteAscii(string value) => WriteBytes(Encoding.ASCII.GetBytes(value));
        private void WriteBytes(byte[] bytes) => output.Write(bytes, 0, bytes.Length);
        private void WriteByte(byte value) => output.WriteByte(value);
        private void WriteUInt16(ushort value)
        {
            WriteByte((byte)value);
            WriteByte((byte)(value >> 8));
        }
    }

    private sealed class GifSubBlockWriter(Stream output)
    {
        private readonly byte[] _buffer = new byte[255];
        private int _count;

        public void Write(byte value)
        {
            _buffer[_count++] = value;
            if (_count == _buffer.Length) Flush();
        }

        public void Complete()
        {
            Flush();
            output.WriteByte(0);
        }

        private void Flush()
        {
            if (_count == 0) return;
            output.WriteByte((byte)_count);
            output.Write(_buffer, 0, _count);
            _count = 0;
        }
    }
}
