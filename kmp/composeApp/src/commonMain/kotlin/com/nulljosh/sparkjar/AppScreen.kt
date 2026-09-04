package com.nulljosh.sparkjar

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun SparkjarTheme(content: @Composable () -> Unit) =
    MaterialTheme(colorScheme = lightColorScheme(), content = content)

@Composable
fun AppScreen(client: SparkjarClient = SparkjarClient()) {
    var posts by remember { mutableStateOf<List<Post>>(emptyList()) }
    var selected by remember { mutableStateOf<Post?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun open(p: Post) {
        // The feed list omits content to keep it small; fetch the full post.
        scope.launch { runCatching { selected = client.post(p.id) }.onFailure { selected = p } }
    }

    LaunchedEffect(Unit) {
        runCatching { posts = client.posts() }.onFailure { error = it.message ?: "failed to load" }
        loading = false
    }

    Surface {
        Column(Modifier.fillMaxSize().padding(24.dp)) {
            Text("Sparkjar", style = MaterialTheme.typography.headlineMedium)
            val current = selected
            when {
                loading -> CircularProgressIndicator(Modifier.padding(top = 24.dp))
                error != null -> Text(error!!, modifier = Modifier.padding(top = 16.dp))
                current != null -> {
                    Button(onClick = { selected = null }, modifier = Modifier.padding(top = 16.dp)) { Text("Back") }
                    Text(current.title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp))
                    Text("by ${current.author.username} - ${current.category}", modifier = Modifier.padding(top = 4.dp))
                    Text(current.content, modifier = Modifier.padding(top = 16.dp))
                }
                else -> LazyColumn(
                    modifier = Modifier.padding(top = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(posts) { p ->
                        Column(Modifier.fillMaxWidth()) {
                            Text(p.title, style = MaterialTheme.typography.titleMedium)
                            Text("${p.author.username} - ${p.category} - ${p.score} pts")
                            Button(onClick = { open(p) }, modifier = Modifier.padding(top = 4.dp)) { Text("Open") }
                        }
                    }
                }
            }
        }
    }
}
