class Solution:
    def floodFill(self, image: List[List[int]], sr: int, sc: int, color: int) -> List[List[int]]:
        start = image[sr][sc]
        if start == color:
            return image
        rows, cols = len(image), len(image[0])

        def fill(r, c):
            if r < 0 or r >= rows or c < 0 or c >= cols or image[r][c] != start:
                return
            image[r][c] = color
            fill(r + 1, c)
            fill(r - 1, c)
            fill(r, c + 1)
            fill(r, c - 1)

        fill(sr, sc)
        return image
