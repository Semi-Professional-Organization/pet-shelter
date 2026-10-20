import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageUpload } from "@/components/admin/ImageUpload";

describe("ImageUpload Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should export ImageUpload component", () => {
    expect(ImageUpload).toBeDefined();
    expect(typeof ImageUpload).toBe("function");
  });

  it("should accept required onImagesChange prop", () => {
    const mockCallback = vi.fn();

    expect(() => {
      renderToStaticMarkup(
        React.createElement(ImageUpload, { onImagesChange: mockCallback })
      );
    }).not.toThrow();
  });

  it("should accept optional maxImages prop with default of 4", () => {
    const mockCallback = vi.fn();

    const html = renderToStaticMarkup(
      React.createElement(ImageUpload, {
        onImagesChange: mockCallback,
        maxImages: 4,
      })
    );

    expect(html).toBeDefined();
    expect(html).toContain("0/4");
  });

  it("should accept optional initialImages prop", () => {
    const mockCallback = vi.fn();
    const initialImages = [
      { url: "/uploads/img1.jpg", name: "img1.jpg", size: 1024 },
    ];

    const html = renderToStaticMarkup(
      React.createElement(ImageUpload, {
        onImagesChange: mockCallback,
        initialImages,
      })
    );

    expect(html).toBeDefined();
    expect(html).toContain("url=%2Fuploads%2Fimg1.jpg");
  });

  it("should accept optional label and description props", () => {
    const mockCallback = vi.fn();

    const html = renderToStaticMarkup(
      React.createElement(ImageUpload, {
        onImagesChange: mockCallback,
        label: "Custom Label",
        description: "Custom Description",
      })
    );

    expect(html).toBeDefined();
    expect(html).toContain("Custom Label");
    expect(html).toContain("Custom Description");
  });

  it("should set maxImages default to 4", () => {
    const mockCallback = vi.fn();

    const html = renderToStaticMarkup(
      React.createElement(ImageUpload, {
        onImagesChange: mockCallback,
      })
    );

    expect(html).toBeDefined();
    expect(html).toContain("0/4");
  });

  it("should support up to maxImages count", () => {
    const mockCallback = vi.fn();

    const testCases = [1, 2, 3, 4, 5, 10];

    testCases.forEach((maxImages) => {
      const html = renderToStaticMarkup(
        React.createElement(ImageUpload, {
          onImagesChange: mockCallback,
          maxImages,
        })
      );
      expect(html).toBeDefined();
      expect(html).toContain(`0/${maxImages}`);
    });
  });
});


