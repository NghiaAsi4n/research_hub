"""Sinh fixture PDF cho test của T5 (fetcher PDF, Giai đoạn 1).

Chạy lại khi cần đổi fixture:

    python packages/pipeline/scripts/make-pdf-fixtures.py

Không dùng thư viện ngoài: PDF dựng thô bằng đối tượng và bảng xref tính tay. Font chuẩn Helvetica
đủ để pdf.js trích được lớp văn bản, và ba cỡ chữ đủ để phân biệt tiêu đề mục với thân bài. Fixture
cố ý chỉ dùng ký tự ASCII: font chuẩn của PDF không mang được dấu tiếng Việt nếu không nhúng font,
việc kiểm tra dấu được làm bằng file PDF thật trong bài kiểm chứng sống.
"""

from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[1] / "src" / "read" / "__fixtures__"

BODY_SIZE = 11
SECTION_SIZE = 14
TITLE_SIZE = 20


def escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def text_at(font: str, size: int, x: int, y: int, text: str) -> str:
    return f"BT /{font} {size} Tf 1 0 0 1 {x} {y} Tm ({escape(text)}) Tj ET"


def build_pdf(page_streams: list[str], with_image: bool = False) -> bytes:
    """Dựng PDF nhiều trang: 1 catalog, 2 cây trang, mỗi trang một đối tượng page + content, rồi font."""
    page_count = len(page_streams)
    first_page = 3
    first_content = first_page + page_count
    font_body = first_content + page_count
    font_section = font_body + 1
    font_title = font_section + 1
    image_object = font_title + 1

    resources = (
        f"/Font << /F1 {font_body} 0 R /F2 {font_section} 0 R /F3 {font_title} 0 R >>"
    )
    if with_image:
        resources += f" /XObject << /Im1 {image_object} 0 R >>"

    objects: dict[int, bytes] = {}
    kids = " ".join(f"{first_page + i} 0 R" for i in range(page_count))
    objects[1] = b"<< /Type /Catalog /Pages 2 0 R >>"
    objects[2] = f"<< /Type /Pages /Kids [{kids}] /Count {page_count} >>".encode("ascii")

    for index, stream in enumerate(page_streams):
        page_object = first_page + index
        content_object = first_content + index
        objects[page_object] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            f"/Resources << {resources} >> /Contents {content_object} 0 R >>"
        ).encode("ascii")
        payload = stream.encode("latin-1")
        objects[content_object] = (
            b"<< /Length "
            + str(len(payload)).encode("ascii")
            + b" >>\nstream\n"
            + payload
            + b"\nendstream"
        )

    objects[font_body] = (
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    )
    objects[font_section] = (
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
    )
    objects[font_title] = (
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
    )
    if with_image:
        # Ảnh 2x2 xám, không nén: trang chỉ có ảnh, không có lớp văn bản (giả lập bản scan).
        pixels = bytes([0x40, 0x80, 0xC0, 0xFF])
        objects[image_object] = (
            b"<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray "
            b"/BitsPerComponent 8 /Length "
            + str(len(pixels)).encode("ascii")
            + b" >>\nstream\n"
            + pixels
            + b"\nendstream"
        )

    out = bytearray(b"%PDF-1.4\n")
    offsets: dict[int, int] = {}
    for number in sorted(objects):
        offsets[number] = len(out)
        out += f"{number} 0 obj\n".encode("ascii") + objects[number] + b"\nendobj\n"

    size = max(objects) + 1
    xref_offset = len(out)
    out += f"xref\n0 {size}\n".encode("ascii")
    out += b"0000000000 65535 f \n"
    for number in range(1, size):
        out += f"{offsets[number]:010d} 00000 n \n".encode("ascii")
    out += (
        f"trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(out)


def contract_streams() -> list[str]:
    """Ba trang, mỗi trang là một content stream đã ghép sẵn."""
    page_one = [
        text_at("F3", TITLE_SIZE, 72, 780, "HOP DONG MAU VE CUNG CAP DICH VU"),
        text_at("F1", BODY_SIZE, 72, 756, "So: 01/2026/HD-DV"),
        text_at("F2", SECTION_SIZE, 72, 712, "1. Doi tuong cua hop dong"),
        text_at("F1", BODY_SIZE, 72, 688, "Ben A dong y cung cap cho Ben B dich vu nghien cuu tai lieu"),
        text_at("F1", BODY_SIZE, 72, 674, "phap ly theo pham vi va tien do ghi tai phu luc cua hop dong nay."),
        text_at("F1", BODY_SIZE, 72, 646, "Cac tai lieu ma Ben A cung cap phai con hieu luc tai thoi diem su dung."),
        text_at("F2", SECTION_SIZE, 72, 602, "2. Gia tri va phuong thuc thanh toan"),
        text_at("F1", BODY_SIZE, 72, 578, "Gia tri hop dong la 120.000.000 dong, da bao gom thue gia tri gia tang."),
        text_at("F1", BODY_SIZE, 72, 564, "Ben B thanh toan lam hai dot, moi dot khong qua muoi lam ngay lam viec."),
        text_at("F1", BODY_SIZE, 72, 60, "Trang 1/3"),
    ]
    page_two = [
        text_at("F2", SECTION_SIZE, 72, 760, "3. Quyen va nghia vu cua cac ben"),
        text_at("F1", BODY_SIZE, 72, 736, "Ben A bao dam ket qua nghien cuu trung thuc va khong trung lap voi"),
        text_at("F1", BODY_SIZE, 72, 722, "bat ky nghia vu nao dang thuc hien cho ben thu ba."),
        text_at("F1", BODY_SIZE, 72, 694, "Ben B cung cap day du ho so, tai lieu va thong tin can thiet de phuc vu"),
        text_at("F1", BODY_SIZE, 72, 680, "cong viec nghien cuu, dong thoi bao mat moi thong tin nhan duoc."),
        text_at("F2", SECTION_SIZE, 72, 636, "4. Thoi han cua hop dong"),
        text_at("F1", BODY_SIZE, 72, 612, "Hop dong co hieu luc trong muoi hai thang ke tu ngay ky va co the gia han"),
        text_at("F1", BODY_SIZE, 72, 598, "neu hai ben co thoa thuan bang van ban truoc khi het han muoi lam ngay."),
        text_at("F1", BODY_SIZE, 72, 60, "Trang 2/3"),
        text_at("F1", BODY_SIZE, 72, 46, "Hai ben cam ket thuc hien dung cac dieu khoan da thoa thuan."),
    ]
    page_three = [
        text_at("F2", SECTION_SIZE, 72, 760, "5. Xu ly tranh chap"),
        text_at("F1", BODY_SIZE, 72, 736, "Moi tranh chap phat sinh truoc tien duoc giai quyet bang thuong luong."),
        text_at("F1", BODY_SIZE, 72, 722, "Neu khong dat ket qua thi dua ra Trung tam trong tai thuong mai."),
        text_at("F1", BODY_SIZE, 72, 60, "Trang 3/3"),
    ]
    return ["\n".join(page) for page in (page_one, page_two, page_three)]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    contract = build_pdf(contract_streams())
    (OUT_DIR / "contract-3-pages.pdf").write_bytes(contract)

    scan = build_pdf(
        ["q 595 0 0 842 0 0 cm /Im1 Do Q"],
        with_image=True,
    )
    (OUT_DIR / "scan-1-page.pdf").write_bytes(scan)

    print(f"contract-3-pages.pdf: {len(contract)} byte")
    print(f"scan-1-page.pdf: {len(scan)} byte")


if __name__ == "__main__":
    main()
