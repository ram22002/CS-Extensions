package com.nextgen

import com.lagradost.cloudstream3.HomePageResponse
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.MainPageData
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import java.util.concurrent.ConcurrentHashMap

@OptIn(ExperimentalCoroutinesApi::class)
internal object NextGenParallel {
    private const val TTL_MS = 3 * 60 * 1000L

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private class Slot(val deferred: Deferred<HomePageResponse>, val at: Long)

    private val slots = ConcurrentHashMap<String, Slot>()

    suspend fun page(
        api: MainAPI,
        page: Int,
        name: String,
        data: String,
        rows: List<MainPageData>,
        loader: suspend (Int, String, String) -> HomePageResponse,
    ): HomePageResponse {
        if (page > 1) return loader(page, name, data)

        val now = System.currentTimeMillis()
        fun key(rowData: String) = "${api.name}|$rowData"

        val targets = rows.map { it.name to it.data }.let { list ->
            if (list.any { it.second == data }) list else list + (name to data)
        }
        for ((rowName, rowData) in targets) {
            slots.compute(key(rowData)) { _, old ->
                val usable = old != null && now - old.at < TTL_MS &&
                    !old.deferred.isCancelled &&
                    !(old.deferred.isCompleted && old.deferred.getCompletionExceptionOrNull() != null)
                if (usable) old else Slot(scope.async { loader(1, rowName, rowData) }, now)
            }
        }

        val mine = slots.getValue(key(data))
        return try {
            mine.deferred.await()
        } catch (e: Exception) {
            slots.remove(key(data), mine)
            throw e
        }
    }
}
