// Re-encodes a PNG as 1024x1024 sRGB. Without --keep-alpha the alpha channel is
// dropped (iOS app icons must be opaque). Usage:
//
//   swift flatten.swift <in.png> <out.png> [--keep-alpha]
import AppKit
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: flatten.swift <in.png> <out.png> [--keep-alpha]\n".data(using: .utf8)!)
    exit(2)
}
let keepAlpha = args.contains("--keep-alpha")
let inURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])

guard let source = CGImageSourceCreateWithURL(inURL as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    FileHandle.standardError.write("cannot read \(inURL.path)\n".data(using: .utf8)!)
    exit(1)
}

let size = 1024
let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
let info: CGImageAlphaInfo = keepAlpha ? .premultipliedLast : .noneSkipLast
guard let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                          space: srgb, bitmapInfo: info.rawValue) else {
    FileHandle.standardError.write("cannot create context\n".data(using: .utf8)!)
    exit(1)
}
ctx.interpolationQuality = .high
if !keepAlpha {
    ctx.setFillColor(CGColor(colorSpace: srgb, components: [1, 1, 1, 1])!)
    ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
}
ctx.draw(image, in: CGRect(x: 0, y: 0, width: size, height: size))
guard let out = ctx.makeImage(),
      let dest = CGImageDestinationCreateWithURL(outURL as CFURL, UTType.png.identifier as CFString, 1, nil) else {
    FileHandle.standardError.write("cannot write \(outURL.path)\n".data(using: .utf8)!)
    exit(1)
}
CGImageDestinationAddImage(dest, out, nil)
guard CGImageDestinationFinalize(dest) else {
    FileHandle.standardError.write("finalize failed\n".data(using: .utf8)!)
    exit(1)
}
print("wrote \(outURL.path)")
