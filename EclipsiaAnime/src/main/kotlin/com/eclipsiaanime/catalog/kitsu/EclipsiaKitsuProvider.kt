package com.eclipsiaanime

import com.lagradost.cloudstream3.HomePageResponse
import com.lagradost.cloudstream3.LoadResponse
import com.lagradost.cloudstream3.MainPageData
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.SearchResponseList
import com.lagradost.cloudstream3.newSearchResponseList

class EclipsiaKitsuProvider : EclipsiaAnimeProvider() {
    override var name = "EclipsiaKitsu"
    override val apiName = "EclipsiaKitsu"
    override val mainPage: List<MainPageData>
        get() = if (EclipsiaStore.kitsuEnabled) EclipsiaKitsuApi.activeRows() else emptyList()

    override suspend fun load(url: String): LoadResponse? =
        with(EclipsiaDetails) { loadDetails(url, kitsu = true) } ?: super.load(url)

    override suspend fun search(query: String): List<SearchResponse>? =
        if (EclipsiaStore.kitsuEnabled) EclipsiaKitsuApi.search(this, query) else emptyList()

    override suspend fun search(query: String, page: Int): SearchResponseList? =
        if (EclipsiaStore.kitsuEnabled)
            newSearchResponseList(EclipsiaKitsuApi.search(this, query, page), hasNext = true)
        else newSearchResponseList(emptyList(), hasNext = false)

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse =
        EclipsiaKitsuApi.page(this, page, request)
}
