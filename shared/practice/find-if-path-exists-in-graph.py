class Solution:
    def validPath(self, n: int, edges: List[List[int]], source: int, destination: int) -> bool:
        graph = {node: [] for node in range(n)}
        for u, v in edges:
            graph[u].append(v)
            graph[v].append(u)
        visited = {source}
        queue = deque([source])
        while queue:
            node = queue.popleft()
            if node == destination:
                return True
            for nxt in graph[node]:
                if nxt not in visited:
                    visited.add(nxt)
                    queue.append(nxt)
        return False
